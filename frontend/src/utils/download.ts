export function saveDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.hidden = true

  try {
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    // Let the browser start reading the blob before releasing its URL.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
