import { expect, test } from '@playwright/test'
import { createServer, type ViteDevServer } from 'vite'

let server: ViteDevServer | undefined
let baseURL: string

test.beforeAll(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0 } })
  await server.listen()
  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') throw new Error('Vite HTTP server did not start')
  baseURL = `http://127.0.0.1:${address.port}`
})

test.afterAll(async () => {
  await server?.close()
})

test('serves every asset declared in the demo manifest', async ({ request }) => {
  const page = await request.get(baseURL)
  await expect(page).toBeOK()
  expect(await page.text()).toContain('lang="vi"')

  const manifest = await request.get(`${baseURL}/data/v1/manifest.json`)
  await expect(manifest).toBeOK()
  const snapshot = await manifest.json()
  expect(snapshot.isDemo).toBe(true)
  const files = Object.values(snapshot.files) as string[]
  expect(files).toHaveLength(6)

  for (const file of files) {
    const response = await request.get(`${baseURL}/data/v1/${file}`)
    await expect(response).toBeOK()
    expect(await response.json()).toBeTruthy()
  }
})
