import { chromium, expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
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
  await page.getByRole('combobox', { name: 'Tìm địa bàn' }).fill('00004')
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
  const metricTooltip = table.locator('.ui-tooltip').filter({ hasText: '32.000' }).first()
  await metricTooltip.locator('[tabindex="0"]').focus()
  await expect(metricTooltip.getByRole('tooltip')).toContainText('market_observations.json')
  await page.getByLabel('Địa bàn 3').selectOption('P79')
  await expect(page.getByRole('status')).toContainText('cùng cấp')
  await expect(table).toHaveCount(0)
})

test('supports keyboard autocomplete, compound filter presets, and scoring matched areas', async ({ page }) => {
  await openWorkspace(page)
  const search = page.getByRole('combobox', { name: 'Tìm địa bàn' })
  await search.fill('ba dinh')
  await expect(page.getByRole('listbox', { name: 'Gợi ý địa bàn' })).toBeVisible()
  await search.press('ArrowDown')
  await search.press('Enter')
  await expect(page).toHaveURL(/area=W00004/)
  await page.goto(`${origin}/#/map?snapshot=demo`)
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await search.fill('')

  await page.getByRole('button', { name: 'Thêm điều kiện' }).click()
  await page.getByRole('button', { name: 'Thêm điều kiện' }).click()
  await page.getByLabel('Toán tử 1').selectOption('between')
  await page.getByLabel('Cận dưới 1').fill('9000000')
  await page.getByLabel('Cận trên 1').fill('9500000')
  await page.getByLabel('Chỉ tiêu 2').selectOption('unmet')
  await page.getByLabel('Ngưỡng 2').fill('50')
  await page.getByLabel('Kết hợp điều kiện').selectOption('any')
  await page.getByRole('button', { name: 'Áp dụng bộ lọc' }).click()
  await expect(page.locator('[aria-label="Nhóm kết quả"]')).toContainText('2')

  await page.getByLabel('Tên preset bộ lọc').fill('Nhu cầu và dân số')
  await page.getByRole('button', { name: 'Lưu preset' }).click()
  await expect(page.getByLabel('Chọn bộ lọc preset')).toContainText('Nhu cầu và dân số')

  await page.getByLabel('Số địa bàn tối đa để chấm điểm').selectOption('2')
  await page.getByRole('button', { name: 'Chấm điểm tất cả địa bàn đạt' }).click()
  await expect(page).toHaveURL(/\/decision\?.*areas=P79%2CP01/)
  await expect(page.getByRole('heading', { name: 'Chấm điểm địa bàn' })).toBeVisible()
  await expect(page.getByLabel('Ứng viên 1')).toHaveValue('P79')
  await expect(page.getByLabel('Ứng viên 2')).toHaveValue('P01')
  await expect(page.getByLabel('Phiên bản thuật toán')).toHaveValue('min-max-v2')
  await expect(page.getByLabel('Phạm vi chuẩn hóa')).toHaveValue('same-level')
  await expect(page.getByText(/Tất cả 2 địa bàn đủ dữ liệu/)).toBeVisible()
})

test('locates an area from typed coordinates and from a selected map point', async ({ page }) => {
  await openWorkspace(page)
  await page.getByLabel('Tìm theo tọa độ (vĩ độ, kinh độ)').fill('21, 105.8')
  await page.getByRole('button', { name: 'Tìm tọa độ' }).click()
  await expect(page).toHaveURL(/area=P01/)
  await expect(page.getByRole('status').filter({ hasText: 'Thành phố Hà Nội' })).toBeVisible()

  await page.getByRole('button', { name: 'Việt Nam' }).click()
  await page.getByRole('button', { name: 'Chọn điểm trên bản đồ' }).click()
  await expect(page.getByText('Chọn một điểm trên bản đồ để xác định địa bàn chứa tọa độ.')).toBeVisible()
  const province = page.locator('[data-geo-id="P01"]')
  await expect(province).toBeVisible()
  const bounds = await province.boundingBox()
  if (!bounds) throw new Error('Province feature has no visible bounds')
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await expect(page).toHaveURL(/area=P01/)
  await expect(page.getByRole('status').filter({ hasText: 'Thành phố Hà Nội' })).toBeVisible()
})

test('shows profile KPIs and the three-area radar without horizontal page overflow at 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await blockExternalRequests(page)
  await page.goto(`${origin}/#/area/W00004?snapshot=demo`)

  const kpis = page.locator('section[aria-label="Chỉ số chính và trung vị đối chiếu"]')
  await expect(kpis).toBeVisible()
  await expect(kpis).toContainText('Trung vị:')
  await expect(page.getByRole('img', { name: /Khoảng sẵn lòng trả/ })).toBeVisible()

  await page.goto(`${origin}/#/compare?snapshot=demo&areas=W00004,W00070,W26740`)
  await expect(page.getByRole('heading', { name: 'Hồ sơ năng lực tương đối' })).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(3)
  await expect(page.getByText('Bảng dữ liệu thay thế')).toHaveCount(3)
  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(pageWidth).toBeLessThanOrEqual(360)
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
  await results.locator('details > summary').filter({ hasText: 'Thành phố Hà Nội' }).click({ force: true })
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

test('scores min-max-v2, enforces hard constraints, and shows sensitivity results', async ({ page }) => {
  await blockExternalRequests(page)
  await page.goto(`${origin}/#/decision?snapshot=demo&areas=P01,P79`)
  for (const code of ['population', 'spending', 'retail', 'online']) {
    await page.getByLabel('Chỉ tiêu bổ sung').selectOption(code)
    await page.getByRole('button', { name: 'Thêm tiêu chí' }).click()
  }
  await expect(page.getByLabel('Chỉ tiêu bổ sung')).toBeDisabled()
  await page.getByLabel('Preset trọng số').selectOption('balanced')
  await expect(page.getByLabel('Trọng số unmet')).toHaveValue('17')
  await page.getByLabel('Phiên bản thuật toán').selectOption('min-max-v2')
  await page.getByLabel('Phạm vi chuẩn hóa').selectOption('same-level')
  await page.getByLabel('Chỉ tiêu ràng buộc').selectOption('population')
  await page.getByRole('button', { name: 'Thêm ràng buộc' }).click()
  await page.getByLabel('Ngưỡng population').fill('9000000')

  const calculate = page.getByRole('button', { name: 'Tính điểm' })
  const results = page.getByRole('region', { name: 'Kết quả xếp hạng' })
  await calculate.click()
  await expect(results).toContainText('Hạng')
  await expect(page.getByRole('heading', { name: 'Phân tích độ nhạy trọng số' })).toBeVisible()
  await expect(page.getByText(/Thứ hạng ổn định|Thứ hạng nhạy cảm/).first()).toBeVisible()

  const jsonDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Tải JSON' }).click()
  const report = JSON.parse(await readFile((await (await jsonDownload).path())!, 'utf8'))
  expect(report).toMatchObject({
    algorithmVersion: 'min-max-v2',
    normalizationScope: 'same-level',
    preset: 'Cân bằng',
    constraints: [{ code: 'population', operator: 'gte', threshold: 9000000 }],
  })

  await page.getByLabel('Ngưỡng population').fill('12000000')
  await calculate.click()
  await expect(results).toContainText('Chưa đủ hai địa bàn')
  await expect(results).toContainText('Không đạt ràng buộc')
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

  await page.getByRole('combobox', { name: 'Tìm địa bàn' }).fill('04')
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
  await layer.selectOption({ label: 'Điểm cơ hội' })
  await expect(page.getByRole('heading', { name: 'Điểm cơ hội' })).toBeVisible()
  expect(await map.locator('[data-geo-id="P01"]').getAttribute('fill'))
    .not.toBe(await map.locator('[data-geo-id="P79"]').getAttribute('fill'))
  await layer.selectOption({ label: 'Nhu cầu chưa đáp ứng' })

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

  const search = page.getByRole('combobox', { name: 'Tìm địa bàn' })
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
  await page.getByRole('navigation', { name: 'Đường dẫn' }).getByRole('link', { name: 'Bản đồ' }).click()
  await expect(popup).toContainText('Hoàn Kiếm')
  await page.getByRole('navigation', { name: 'Cấp hành chính' })
    .getByRole('button', { name: 'Việt Nam', exact: true }).click()
  await expect(layer).toHaveValue('unmet')
  await expect.poll(async () => Math.abs(await pathWidth() - zoomedWidth)).toBeLessThanOrEqual(1)
})

test('preserves analysis context in shared navigation and makes the mobile search sheet draggable', async ({ page }) => {
  await blockExternalRequests(page)
  await page.goto(`${origin}/#/map?snapshot=demo&period=2025-Q3&segment=urban_adults&study=grocery_delivery_v1&areas=P01%2CP79&province=P01&layer=unmet`)
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'So sánh' }).click()
  await expect(page).toHaveURL(/snapshot=demo/)
  await expect(page).toHaveURL(/period=2025-Q3/)
  await expect(page).toHaveURL(/segment=urban_adults/)
  await expect(page).toHaveURL(/study=grocery_delivery_v1/)
  await expect(page).toHaveURL(/areas=P01%2CP79/)
  await expect(page).toHaveURL(/province=P01/)
  await expect(page).toHaveURL(/layer=unmet/)
  await expect(page.getByRole('link', { name: 'So sánh', exact: true })).toHaveAttribute('aria-current', 'page')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${origin}/#/map?snapshot=demo`)
  const search = page.getByRole('combobox', { name: 'Tìm địa bàn' })
  await expect(search).not.toBeVisible()
  const handle = page.getByRole('button', { name: 'Kéo để mở rộng hoặc thu gọn tìm kiếm' })
  const box = await handle.boundingBox()
  if (!box) throw new Error('Search sheet handle is not visible')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y - 260, { steps: 8 })
  await page.mouse.up()
  await expect(search).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Bản đồ' }))
    .toHaveAttribute('aria-current', 'page')
})

test('switches to dark mode, persists the choice, and respects reduced motion', async ({ page }) => {
  await openWorkspace(page)
  const toggle = page.getByRole('button', { name: 'Chuyển sang giao diện tối' })
  await toggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect.poll(() => page.locator('body').evaluate(element => getComputedStyle(element).backgroundColor))
    .toBe('rgb(11, 17, 32)')
  expect(await page.evaluate(() => localStorage.getItem('vmi-theme'))).toBe('dark')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('button', { name: 'Chuyển sang giao diện sáng' })).toBeVisible()

  await page.emulateMedia({ reducedMotion: 'reduce' })
  const transition = await page.getByRole('button', { name: 'Chuyển sang giao diện sáng' })
    .evaluate(element => getComputedStyle(element).transitionDuration)
  expect(parseFloat(transition)).toBeLessThanOrEqual(0.00001)
})

test('applies dark tokens to the Leaflet popup, map, and Chart.js canvases', async ({ page }) => {
  await openWorkspace(page)
  await page.getByRole('combobox', { name: 'Tìm địa bàn' }).fill('00070')
  await page.getByRole('button', { name: /Hoàn Kiếm/ }).click()
  const popup = page.locator('.leaflet-popup-content-wrapper')
  await expect(popup).toBeVisible()

  await page.getByRole('button', { name: 'Chuyển sang giao diện tối' }).click()
  await expect.poll(() => popup.evaluate(element => getComputedStyle(element).backgroundColor))
    .toBe('rgb(17, 24, 39)')
  await expect.poll(() => page.locator('.leaflet-container')
    .evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(17, 24, 39)')

  await page.goto(`${origin}/#/compare?snapshot=demo&areas=P01,P79`)
  const charts = page.locator('canvas')
  await expect(charts).toHaveCount(2)
  await expect.poll(() => charts.first().evaluate(canvas => {
    const context = canvas.getContext('2d')
    if (!context) return 0
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    let lightTextPixels = 0
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] > 170 && pixels[index + 1] > 170 && pixels[index + 2] > 170 && pixels[index + 3] > 0) {
        lightTextPixels += 1
      }
    }
    return lightTextPixels
  })).toBeGreaterThan(0)
})

test('gives a missing value a hatch and zero a numeric color', async ({ page }) => {
  await openWorkspace(page)
  await page.getByRole('combobox', { name: 'Tìm địa bàn' }).fill('26740')
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
  const search = page.getByRole('combobox', { name: 'Tìm địa bàn' })
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

test('completes map to profile to comparison to scoring and exports CSV', async ({ page }) => {
  await openWorkspace(page)
  await page.getByRole('combobox', { name: 'Tìm địa bàn' }).fill('Hà Nội')
  await page.getByRole('button', { name: /^Thành phố Hà Nội/ }).click()
  await page.getByRole('link', { name: 'Xem hồ sơ địa bàn' }).click()
  await expect(page.getByRole('heading', { name: 'Thành phố Hà Nội' })).toBeVisible()

  await page.getByRole('link', { name: 'So sánh địa bàn' }).click()
  await page.getByLabel('Địa bàn 2').selectOption('P79')
  await page.getByRole('link', { name: 'Chấm điểm các địa bàn này' }).click()
  await expect(page.getByRole('heading', { name: 'Chấm điểm địa bàn' })).toBeVisible()
  await page.getByRole('button', { name: 'Tính điểm' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Tải CSV' }).click()
  const csvPath = await (await download).path()
  if (!csvPath) throw new Error('CSV download did not produce a file')
  const csv = await readFile(csvPath, 'utf8')
  expect(csv).toContain('algorithmVersion')
  expect(csv).toContain('Thành phố Hà Nội')
  expect(csv).toContain('Thành phố Hồ Chí Minh')
})

test('has no axe violations on the map, profile, comparison, or scoring pages', async ({ page }) => {
  await blockExternalRequests(page)
  const routes = [
    { path: '/#/map?snapshot=demo', ready: () => page.locator('.leaflet-container').waitFor() },
    { path: '/#/area/W00004?snapshot=demo', ready: () => page.getByRole('heading', { name: 'Ba Đình' }).waitFor() },
    { path: '/#/compare?snapshot=demo&areas=P01,P79', ready: () => page.getByRole('heading', { name: 'So sánh địa bàn' }).waitFor() },
    { path: '/#/decision?snapshot=demo&areas=P01,P79', ready: () => page.getByRole('heading', { name: 'Chấm điểm địa bàn' }).waitFor() },
  ]
  for (const route of routes) {
    await page.goto(`${origin}${route.path}`)
    await route.ready()
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations, `${route.path}: ${JSON.stringify(results.violations.map(item => ({
      id: item.id,
      impact: item.impact,
      nodes: item.nodes.map(node => node.target),
    })))}`).toEqual([])
  }
})
