import { toImage } from 'supernote-typescript'

self.onmessage = async function(e) {
  const { pageIndex, note } = e.data
  try {
    const [image] = await toImage(note, [pageIndex])
    const imageBuffer = await image.toBuffer('image/png')
    postMessage({
      pageIndex,
      imageData: imageBuffer,
      status: 'success'
    })
  } catch (error) {
    postMessage({
      pageIndex,
      error: error.message,
      status: 'error'
    })
  }
}
