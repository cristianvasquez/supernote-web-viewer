import { SupernoteX } from 'supernote-typescript'
import MyWorker from './worker.js?worker'

class SupernoteWorker {
  constructor() {
    this.worker = new MyWorker()
  }

  process(note, pageIndex) {
    this.worker.postMessage({ note, pageIndex })
  }

  onMessage(callback) {
    this.worker.onmessage = (e) => callback(e.data)
  }

  terminate() {
    this.worker.terminate()
  }
}

export class SupernoteViewer {
  constructor(options = {}) {
    this.maxWorkers = options.maxWorkers || Math.min(navigator.hardwareConcurrency || 3, 8)
    this.onProgress = options.onProgress || (() => {})
    this.onPageComplete = options.onPageComplete || (() => {})
    this.workers = []
    this.completedPages = 0
    this.totalPages = 0
  }

  async processNote(uint8ArrayData) {
    if (!uint8ArrayData || !(uint8ArrayData instanceof Uint8Array)) {
      throw new Error('SupernoteViewer.processNote() requires Uint8Array data')
    }

    // Clean up any existing workers
    this.cleanupWorkers()

    const note = new SupernoteX(uint8ArrayData)
    this.totalPages = note.pages.length
    this.completedPages = 0

    this.workers = Array(this.maxWorkers).fill(null).map(() => new SupernoteWorker())
    const processQueue = Array.from({ length: this.totalPages }, (_, i) => i + 1)

    this.workers.forEach(worker => {
      worker.onMessage(async ({ pageIndex, imageData, status, error }) => {
        if (status === 'success') {
          this.completedPages++
          this.onProgress(this.completedPages, this.totalPages)

          const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageData)))
          const highResSrc = `data:image/png;base64,${base64Image}`

          const img = new Image()
          img.src = highResSrc
          img.onload = () => {
            this.onPageComplete(pageIndex, highResSrc, img.width, img.height)
          }
          img.onerror = (err) => {
            console.error(`Error loading image for dimensions for page ${pageIndex}:`, err)
            this.onPageComplete(pageIndex, highResSrc, 800, 600)
          }
        } else {
          console.error(`Error processing page ${pageIndex}:`, error)
        }

        const nextPage = processQueue.shift()
        if (nextPage) {
          worker.process(note, nextPage)
        }
      })
    })

    this.workers.forEach(worker => {
      const pageIndex = processQueue.shift()
      if (pageIndex) worker.process(note, pageIndex)
    })

    return {
      totalPages: this.totalPages
    }
  }

  cleanupWorkers() {
    this.workers.forEach(worker => worker.terminate())
    this.workers = []
  }

  destroy() {
    this.cleanupWorkers()
  }
}