import { SupernoteX } from 'supernote-typescript'
import MyWorker from './worker?worker'
import { initCardViewer, updateCardImage, initializeCardViewer } from './card-viewer.js'

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

const hardwareConcurrency = navigator.hardwareConcurrency || 3
const MAX_WORKERS = Math.min(hardwareConcurrency, 8)

function updateStatus(message) {
  console.log(message)
}

// Application state
let currentState = 'upload' // 'upload' or 'viewing'
let workers = []

const uploadCard = {
  id: 'upload-card',
  w: 800,
  h: 600,
  prompt: 'Click to select .note file',
  lowResSrc: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f8f9fa" stroke="#dee2e6" stroke-width="4" stroke-dasharray="20,10" rx="8"/><text x="50%" y="50%" font-family="system-ui" font-size="48" fill="#6c757d" text-anchor="middle" dominant-baseline="middle">📄</text></svg>'),
  highResSrc: '',
  isUpload: true
}

function showUploadState() {
  currentState = 'upload'
  initCardViewer([uploadCard])
}

function showViewingState(noteCards) {
  currentState = 'viewing'
  // Hide GitHub fork ribbon permanently
  const forkRibbon = document.querySelector('.github-fork-ribbon')
  if (forkRibbon) {
    forkRibbon.style.display = 'none'
  }
  initCardViewer([uploadCard, ...noteCards])
}

function cleanupWorkers() {
  workers.forEach(worker => worker.terminate())
  workers = []
}

function handleUploadClick() {
  if (currentState === 'viewing') {
    cleanupWorkers()
    showUploadState()
  }
  document.getElementById('noteInput').click()
}

document.addEventListener('DOMContentLoaded', () => {
  initializeCardViewer()
  showUploadState()

  // Set up upload click handler
  window.handleUploadClick = handleUploadClick

  let completedPages = 0
  let totalPages = 0

  document.getElementById('noteInput').addEventListener('change', async (event) => {
    const file = event.target.files[0]
    if (!file) return

    updateStatus('Loading file...')

    const arrayBuffer = await file.arrayBuffer()
    const note = new SupernoteX(new Uint8Array(arrayBuffer))
    totalPages = note.pages.length
    completedPages = 0

    const transparentPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

    const noteCards = Array.from({ length: totalPages }, (_, i) => ({
      id: `page-${i + 1}`,
      w: 800,
      h: 600,
      // prompt: `Page ${i + 1}`,
      lowResSrc: transparentPixel,
      highResSrc: ''
    }))

    // Clean up any existing workers and switch to viewing state
    cleanupWorkers()
    showViewingState(noteCards)

    workers = Array(MAX_WORKERS).fill(null).map(() => new SupernoteWorker())
    const processQueue = Array.from({ length: totalPages }, (_, i) => i + 1)

    workers.forEach(worker => {
      worker.onMessage(async ({ pageIndex, imageData, status, error }) => {
        if (status === 'success') {
          completedPages++
          updateStatus(`Processed ${completedPages}/${totalPages} pages`)

          const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageData)))
          const highResSrc = `data:image/png;base64,${base64Image}`

          const img = new Image()
          img.src = highResSrc
          img.onload = () => {
            updateCardImage(`page-${pageIndex}`, highResSrc, img.width, img.height)
          }
          img.onerror = (err) => {
            console.error(`Error loading image for dimensions for page ${pageIndex}:`, err)
            updateCardImage(`page-${pageIndex}`, highResSrc, 800, 600)
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

    workers.forEach(worker => {
      const pageIndex = processQueue.shift()
      if (pageIndex) worker.process(note, pageIndex)
    })
  })
})
