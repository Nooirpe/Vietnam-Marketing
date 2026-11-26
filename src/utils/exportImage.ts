function safeFilename(filename: string) {
  return filename.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'hinh-anh'
}

export async function downloadElementAsPng(element: HTMLElement, filename: string): Promise<void> {
  const dataUrl = await elementToPngDataUrl(element)
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = `${safeFilename(filename)}.png`
  document.body.append(link)
  link.click()
  link.remove()
}

export async function elementToPngDataUrl(element: HTMLElement): Promise<string> {
  const { toPng } = await import('html-to-image')
  const computedBackground = getComputedStyle(element).backgroundColor
  return toPng(element, {
    backgroundColor: computedBackground === 'rgba(0, 0, 0, 0)' ? '#ffffff' : computedBackground,
    cacheBust: true,
    pixelRatio: 2,
  })
}
