import { chromium, expect, test, type Page } from '@playwright/test'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build, preview, type PreviewServer } from 'vite'

const installedChrome = [
  join(process.env.PROGRAMFILES ?? '', 'Google/Chrome/Application/chrome.exe'),
  join(process.env['PROGRAMFILES(X86)'] ?? '', 'Google/Chrome/Application/chrome.exe'),
].some(existsSync)

if (!existsSync(chromium.executablePath()) && installedChrome) {
  test.use({ channel: 'chrome' })
}

let previewServer: PreviewServer | undefined
let outputDir: string | undefined
let origin: string

test.beforeAll(async () => {
  test.setTimeout(60_000)
  outputDir = await mkdtemp(join(tmpdir(), 'vmi-map-e2e-'))
  const config = { build: { outDir: outputDir }, logLevel: 'silent' as const }
  await build(config)
  previewServer = await preview({
    ...config,
    preview: { host: '127.0.0.1', port: 0 },
  })
  const address = previewServer.httpServer.address()
  if (!address || typeof address === 'string') throw new Error('Vite preview did not start')
  origin = `http://127.0.0.1:${address.port}`
})

test.afterAll(async () => {
  try {
    await previewServer?.close()
  } finally {
    if (outputDir) await rm(outputDir, { recursive: true, force: true })
  }
})

async function blockExternalRequests(page: Page) {
  await page.route('**/*', (route) => {
    const belongsToPreview = new URL(route.request().url()).origin === origin
    return belongsToPreview ? route.fallback() : route.abort()
  })
}

async function openWorkspace(page: Page) {
  await blockExternalRequests(page)
  await page.goto(`${origin}/#/map?snapshot=demo`)
  await expect(page.locator('.leaflet-container')).toBeVisible()
}

test('opens the full profile from the map and compares up to three wards', async ({ page }) => {
  await openWorkspace(page)
  await page.getByRole('searchbox', { name: 'Tìm địa bàn' }).fill('00004')
  await page.getByRole('button', { name: /Ba Đình/ }).click()
  await page.getByRole('link', { name: 'Xem hồ sơ địa bàn' }).click()
  await expect(page.getByRole('heading', { name: 'Bằng chứng Needs & Wants' })).toBeVisible()
  await expect(page.getByText('Kết quả trong mẫu khảo sát · n = 40')).toBeVisible()
  await expect(page.getByText('15.000–20.000 VND/lần giao')).toBeVisible()
  await page.getByRole('link', { name: 'So sánh địa bàn', exact: true }).click()
  await expect(page.getByLabel('Địa bàn 1')).toHaveValue('W00004')
  await page.getByLabel('Địa bàn 2').selectOption('W00070')
  await page.getByLabel('Địa bàn 3').selectOption('W26740')
  await expect(page.getByLabel('Địa bàn 4')).toHaveCount(0)
  await expect(page.getByText(/Tối đa 3 địa bàn/)).toBeVisible()
  const table = page.getByRole('table')
  await expect(table).toContainText('32.000')
  await expect(table).toContainText('15.000–20.000')
  await expect(table).toContainText('Chưa có khảo sát')
  await expect(page.getByRole('img', { name: /Biểu đồ thanh chồng/ })).toBeVisible()
  await table.getByText('Bộ số liệu thị trường mô phỏng v1', { exact: true }).first().click()
  await expect(table.getByText('market_observations.json').first()).toBeVisible()
  await page.getByLabel('Địa bàn 3').selectOption('P79')
  await expect(page.getByRole('status')).toContainText('cùng cấp')
  await expect(table).toHaveCount(0)
})

test('shows missing measurements for a declared period with no observations', async ({ page }) => {
  await blockExternalRequests(page)
  await page.route('**/data/v1/manifest.json', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    body.periods['2025-Q4'] = { start: '2025-10-01', end: '2025-12-31' }
    await route.fulfill({ response, json: body })
  })
  await page.goto(`${origin}/#/compare?snapshot=demo&areas=P01,P79&period=2025-Q3`)
  const table = page.getByRole('table')
  await expect(table).toContainText('9.000.000')
  await page.getByLabel('Kỳ đo').selectOption('2025-Q4')
  await expect(table).toContainText('Kỳ 2025-Q4')
  await expect(table).toContainText('Chưa có dữ liệu')
  await expect(table).not.toContainText('9.000.000')
  await expect(page.getByRole('img', { name: /Biểu đồ Dân số/ })).toBeVisible()
})

test('recalculates after edits and downloads JSON and UTF-8 CSV from the workbench', async ({ page }) => {
  await blockExternalRequests(page)
  await page.goto(`${origin}/#/decision?snapshot=demo&areas=P01,P79`)
  const calculate = page.getByRole('button', { name: 'Tính điểm' })
  const csv = page.getByRole('button', { name: 'Tải CSV' })
  const json = page.getByRole('button', { name: 'Tải JSON' })
  const results = page.getByRole('region', { name: 'Kết quả xếp hạng' })
  await calculate.click()
  await expect(results).toContainText('Thành phố Hồ Chí MinhHạng 1 · 60/100')
  await page.getByRole('spinbutton', { name: 'Trọng số unmet' }).fill('30')
  await expect(csv).toBeDisabled()
  await expect(calculate).toBeDisabled()
  await expect(results).not.toContainText('60/100')
  await page.getByRole('spinbutton', { name: 'Trọng số poi_density' }).fill('70')
  await calculate.click()
  await expect(results).toContainText('Thành phố Hà NộiHạng 1 · 70/100')
  await results.getByText('Thành phố Hà Nội', { exact: true }).click()
  await expect(results.locator('details[open]').getByText('Đóng góp lớn nhất')).toBeVisible()
  const jsonDownload = page.waitForEvent('download')
  await json.click()
  const report = JSON.parse(await readFile((await (await jsonDownload).path())!, 'utf8'))
  expect(report.rows.map((row: { score: number }) => row.score)).toEqual([70, 30])
  const csvDownload = page.waitForEvent('download')
  await csv.click()
  const contents = await readFile((await (await csvDownload).path())!, 'utf8')
  expect(contents.charCodeAt(0)).toBe(0xfeff)
  expect(contents).toContain('"P01","01","Thành phố Hà Nội"')
  await page.getByRole('spinbutton', { name: 'Trọng số poi_density' }).fill('69')
  await expect(page.getByRole('status')).toContainText('Còn thiếu 1%')
  await expect(json).toBeDisabled()
})

test('retries when loading the snapshot fails', async ({ page }) => {
  await blockExternalRequests(page)
  await page.route('**/manifest.json', (route) => route.fulfill({ status: 503 }), { times: 1 })
  await page.goto(`${origin}/#/map?snapshot=demo`)
  await expect(page.getByRole('alert')).toContainText('Không thể tải bộ dữ liệu')
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click()
  await expect(page.locator('.leaflet-container')).toBeVisible()
})

test('shows all 34 province boundaries and keeps areas with missing data on the map', async ({ page }, info) => {
  await blockExternalRequests(page)
  await page.goto(`${origin}/#/map`)
  const map = page.locator('.leaflet-container')
  await expect(map.locator('.leaflet-overlay-pane [data-geo-id]')).toHaveCount(34)
  await expect(page.getByText('OCHA COD-AB v02 / OpenStreetMap', { exact: false })).toBeVisible()
  const missingProvince = map.locator('[data-geo-id="P04"]')
  await expect(missingProvince).toHaveAttribute('fill', /^url\(#vmi-missing-/)
  const capture = info.outputPath('ban-do-34-tinh-thanh.png')
  await map.screenshot({ path: capture, animations: 'disabled' })
  await info.attach('Bản đồ 34 tỉnh thành', { path: capture, contentType: 'image/png' })

  await page.getByRole('searchbox', { name: 'Tìm địa bàn' }).fill('04')
  await page.getByRole('button', { name: /^(Tỉnh )?Cao Bằng.*Mã 04/ }).click()
  const popup = map.getByRole('region', { name: 'Thông tin địa bàn' })
  await expect(popup).toContainText('Chưa có dữ liệu')
  await popup.getByRole('button', { name: 'Xem cấp xã' }).click()
  await expect(page).toHaveURL(/province=P04/)
  await expect(page.getByRole('status').filter({ hasText: 'Chưa có ranh giới cấp xã trong bản này' })).toBeVisible()
})

test('keeps the selected ward when switching between real and schematic geometry', async ({ page }, info) => {
  await blockExternalRequests(page)
  await page.goto(`${origin}/#/map?province=P01&area=W00070&layer=unmet`)
  const map = page.locator('.leaflet-container')
  const ward = map.locator('[data-geo-id="W00070"]')
  const popup = map.getByRole('region', { name: 'Thông tin địa bàn' })
  await expect(map.locator('.leaflet-overlay-pane [data-geo-id]')).toHaveCount(2)
  await expect(ward).toBeVisible()
  await expect(popup).toContainText('Hoàn Kiếm')
  await expect(popup).toContainText('Khoảng chú giải [25, 50)')
  const realOutline = await ward.getAttribute('d')
  const capture = info.outputPath('ranh-gioi-that-hoan-kiem.png')
  await map.screenshot({ path: capture, animations: 'disabled' })
  await info.attach('Ranh giới thật và popup Hoàn Kiếm', { path: capture, contentType: 'image/png' })

  const geometry = page.getByLabel('Hình học bản đồ')
  await geometry.selectOption('schematic')
  await expect(page).toHaveURL(/snapshot=demo/)
  await expect(page).toHaveURL(/area=W00070/)
  await expect(ward).not.toHaveAttribute('d', realOutline ?? '')
  await expect(popup).toContainText('Hoàn Kiếm')
  await geometry.selectOption('boundary')
  await expect(page).not.toHaveURL(/snapshot=demo/)
  await expect(popup).toContainText('Hoàn Kiếm')
})

test('renders a tile-free choropleth and drills down through a province polygon', async ({ page }, info) => {
  await openWorkspace(page)
  const map = page.locator('.leaflet-container')
  const polygons = map.locator('.leaflet-overlay-pane path.leaflet-interactive')
  const layer = page.getByLabel('Lớp bản đồ')
  await expect(polygons).toHaveCount(2)
  const countryScreenshot = info.outputPath('ban-do-toan-quoc.png')
  await map.screenshot({ path: countryScreenshot })
  await info.attach('Bản đồ toàn quốc', { path: countryScreenshot, contentType: 'image/png' })

  const mapElement = await map.elementHandle()
  await layer.selectOption({ label: 'Chỉ xem đường biên' })
  await expect(polygons).toHaveCount(2)
  await layer.selectOption({ label: 'Nhu cầu chưa đáp ứng' })
  expect(await map.evaluate((current, original) => current === original, mapElement)).toBe(true)

  const province = polygons.and(page.locator('[data-geo-id="P01"]'))
  const pathWidth = () => province.evaluate((path) => (path as unknown as SVGPathElement).getBBox().width)
  const initialWidth = await pathWidth()
  await map.getByRole('button', { name: 'Zoom out' }).click()
  await expect.poll(pathWidth).toBeLessThan(initialWidth)
  const zoomedWidth = await pathWidth()
  await province.click()
  const popup = map.getByRole('region', { name: 'Thông tin địa bàn' })
  await expect(popup).toContainText('Hà Nội')
  await popup.getByRole('button', { name: 'Xem cấp xã' }).click()
  await expect(page).toHaveURL(/province=P01/)
  await expect(polygons).toHaveCount(2)

  const search = page.getByRole('searchbox', { name: 'Tìm địa bàn' })
  await search.fill('00070')
  await page.getByRole('button', { name: /Hoàn Kiếm/ }).click()
  await expect(page).toHaveURL(/area=W00070/)
  await expect(popup).toContainText('25')
  await expect(popup).toContainText('40')
  await expect(popup).toContainText('2025-Q3')
  await expect(popup).toContainText('Mẫu thuận tiện mô phỏng')
  await expect(popup).toContainText('Khoảng chú giải [25, 50)')
  await expect.poll(async () => {
    const [popupBounds, mapBounds] = await Promise.all([popup.boundingBox(), map.boundingBox()])
    return !!popupBounds && !!mapBounds && popupBounds.y >= mapBounds.y
  }).toBe(true)
  const wardScreenshot = info.outputPath('popup-phuong-hoan-kiem.png')
  await map.screenshot({ path: wardScreenshot, animations: 'disabled' })
  await info.attach('Popup phường Hoàn Kiếm', { path: wardScreenshot, contentType: 'image/png' })

  await popup.getByRole('link', { name: 'Xem hồ sơ địa bàn' }).click()
  await expect(page).toHaveURL(/\/area\/W00070/)
  await page.getByRole('link', { name: 'Quay về bản đồ' }).click()
  await expect(popup).toContainText('Hoàn Kiếm')
  await page.getByRole('navigation', { name: 'Cấp hành chính' })
    .getByRole('button', { name: 'Việt Nam', exact: true }).click()
  await expect(layer).toHaveValue('unmet')
  await expect.poll(async () => Math.abs(await pathWidth() - zoomedWidth)).toBeLessThanOrEqual(1)
})

test('gives a missing value a hatch and zero a numeric color', async ({ page }) => {
  await openWorkspace(page)
  await page.getByRole('searchbox', { name: 'Tìm địa bàn' }).fill('26740')
  await page.getByRole('button', { name: /Sài Gòn/ }).click()
  await expect(page).toHaveURL(/province=P79/)
  const ward = page.locator('.leaflet-overlay-pane [data-geo-id="W26740"]')
  const layer = page.getByLabel('Lớp bản đồ')
  const popup = page.locator('.leaflet-container').getByRole('region', { name: 'Thông tin địa bàn' })
  await layer.selectOption({ label: 'Chi tiêu bình quân' })
  await expect(ward).toHaveAttribute('fill', /^url\(#vmi-missing-/)
  await expect(popup).toContainText('Chưa thu thập số liệu cấp phường')
  await layer.selectOption({ label: 'Mật độ đối thủ' })
  await expect(ward).toHaveAttribute('fill', /^#[a-f\d]{6}$/i)
  await expect(popup).toContainText(/0\s*(điểm bán|cửa hàng)/)
})

test('finds accented names, aliases and exact codes and restores the hash on browser history', async ({ page }) => {
  await openWorkspace(page)
  const search = page.getByRole('searchbox', { name: 'Tìm địa bàn' })
  for (const query of ['hoan kiem', 'Hoàn Kiếm', '00070']) {
    await search.fill(query)
    await expect(page.getByRole('button', { name: /Hoàn Kiếm/ })).toBeVisible()
  }
  await search.fill('ba dinh')
  await expect(page.getByRole('button', { name: /Ba Đình/ })).toBeVisible()
  await search.fill('TP.HCM')
  const searchResults = page.getByRole('list', { name: 'Kết quả tìm kiếm' })
  await expect(searchResults.getByRole('button').first()).toHaveAccessibleName(/^Thành phố Hồ Chí Minh/)
  await search.fill('00070')
  await page.getByRole('button', { name: /Hoàn Kiếm/ }).click()
  await expect(page).toHaveURL(/province=P01/)
  await expect(page).toHaveURL(/area=W00070/)
  await page.goBack()
  await expect(search).toHaveValue('00070')
  await expect(page).not.toHaveURL(/area=W00070/)
  await page.goForward()
  await expect(page).toHaveURL(/area=W00070/)
})

test('keeps failed, missing and passing results disjoint under two AND conditions', async ({ page }) => {
  await openWorkspace(page)
  await page.getByLabel('Phạm vi tìm kiếm').selectOption('ward')
  const add = page.getByRole('button', { name: 'Thêm điều kiện' })
  await add.click()
  await page.getByLabel('Chỉ tiêu 1').selectOption('population')
  await page.getByLabel('Toán tử 1').selectOption('gt')
  await page.getByLabel('Ngưỡng 1').fill('29000')
  await add.click()
  await page.getByLabel('Chỉ tiêu 2').selectOption('online')
  await page.getByLabel('Toán tử 2').selectOption('gt')
  await page.getByLabel('Ngưỡng 2').fill('50')
  const apply = page.getByRole('button', { name: 'Áp dụng bộ lọc' })
  await apply.click()

  async function verifyCounts(pass: number, fail: number, missing: number) {
    await expect(page.getByRole('button', { name: `${pass} Đạt`, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: `${fail} Không đạt`, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: `${missing} Thiếu dữ liệu`, exact: true })).toBeVisible()
  }

  await verifyCounts(1, 1, 1)
  await expect(page.getByRole('button', { name: /Ba Đình/ })).toBeVisible()
  await page.getByRole('button', { name: '1 Không đạt', exact: true }).click()
  await expect(page.getByRole('button', { name: /Hoàn Kiếm/ })).toBeVisible()
  await page.getByRole('button', { name: '1 Thiếu dữ liệu', exact: true }).click()
  await expect(page.getByRole('button', { name: /Sài Gòn/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Xóa điều kiện 2', exact: true })).toBeVisible()
  await page.getByLabel('Ngưỡng 1').fill('33000')
  await apply.click()
  await verifyCounts(0, 3, 0)
})
