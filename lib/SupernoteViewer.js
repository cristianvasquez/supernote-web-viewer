import { initCardViewer, updateCardImage, initializeCardViewer } from '../src/card-viewer.js'

export class SupernoteViewer {
  constructor(options = {}) {
    this.onProgress = options.onProgress || (() => {})
    this.onPageComplete = options.onPageComplete || (() => {})
    this.onUploadClick = options.onUploadClick || (() => {})
    this.showUploadCard = options.showUploadCard !== false // default to true
    
    this.totalPages = 0
    this.completedPages = 0
    this.pages = new Map() // pageNumber -> { id, width, height, base64Data }
    this.isInitialized = false
    
    // Initialize the card viewer system
    this.initializeViewer()
  }

  initializeViewer() {
    if (!this.isInitialized) {
      initializeCardViewer()
      this.isInitialized = true
    }
    
    if (this.showUploadCard) {
      this.showUploadState()
    } else {
      this.showEmptyGrid()
    }
  }

  showUploadState() {
    const uploadCard = {
      id: 'upload-card',
      w: 800,
      h: 600,
      prompt: 'Click to select .note file',
      lowResSrc: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
        '<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">' +
        '<rect width="100%" height="100%" fill="#f8f9fa" stroke="#dee2e6" stroke-width="4" stroke-dasharray="20,10" rx="8"/>' +
        '<text x="50%" y="50%" font-family="system-ui" font-size="48" fill="#6c757d" text-anchor="middle" dominant-baseline="middle">📄</text>' +
        '</svg>'
      ),
      highResSrc: '',
      isUpload: true,
      onUploadClick: this.onUploadClick
    }
    
    initCardViewer([uploadCard])
  }

  showEmptyGrid() {
    initCardViewer([])
  }

  /**
   * Initialize the viewer with the total number of pages
   * @param {number} totalPages - Total number of pages in the document
   */
  initializePages(totalPages) {
    this.totalPages = totalPages
    this.completedPages = 0
    this.pages.clear()

    // Create transparent placeholder cards for all pages
    const transparentPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
    
    const pageCards = Array.from({ length: totalPages }, (_, i) => ({
      id: `page-${i + 1}`,
      w: 800,
      h: 600,
      lowResSrc: transparentPixel,
      highResSrc: ''
    }))

    // Include upload card if enabled
    const allCards = this.showUploadCard ? [this.createUploadCard(), ...pageCards] : pageCards
    initCardViewer(allCards)
  }

  createUploadCard() {
    return {
      id: 'upload-card',
      w: 800,
      h: 600,
      prompt: 'Click to select .note file',
      lowResSrc: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
        '<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">' +
        '<rect width="100%" height="100%" fill="#f8f9fa" stroke="#dee2e6" stroke-width="4" stroke-dasharray="20,10" rx="8"/>' +
        '<text x="50%" y="50%" font-family="system-ui" font-size="48" fill="#6c757d" text-anchor="middle" dominant-baseline="middle">📄</text>' +
        '</svg>'
      ),
      highResSrc: '',
      isUpload: true,
      onUploadClick: this.onUploadClick
    }
  }

  /**
   * Add a processed page image to the viewer
   * @param {number} pageNumber - Page number (1-indexed)
   * @param {string} base64Data - Base64 encoded PNG image data
   * @param {number} width - Image width in pixels
   * @param {number} height - Image height in pixels
   */
  addPageImage(pageNumber, base64Data, width, height) {
    if (pageNumber < 1 || pageNumber > this.totalPages) {
      console.error(`Invalid page number: ${pageNumber}. Must be between 1 and ${this.totalPages}`)
      return
    }

    const pageId = `page-${pageNumber}`
    const highResSrc = `data:image/png;base64,${base64Data}`

    // Store page data
    this.pages.set(pageNumber, {
      id: pageId,
      width,
      height,
      base64Data,
      highResSrc
    })

    // Update the card in the viewer
    updateCardImage(pageId, highResSrc, width, height)

    // Update progress
    this.completedPages++
    this.onProgress(this.completedPages, this.totalPages)
    this.onPageComplete(pageNumber, highResSrc, width, height)
  }

  /**
   * Reset the viewer to initial state
   */
  reset() {
    this.totalPages = 0
    this.completedPages = 0
    this.pages.clear()
    
    if (this.showUploadCard) {
      this.showUploadState()
    } else {
      this.showEmptyGrid()
    }
  }

  /**
   * Get page data for a specific page
   * @param {number} pageNumber - Page number (1-indexed)
   * @returns {Object|null} Page data or null if not found
   */
  getPageData(pageNumber) {
    return this.pages.get(pageNumber) || null
  }

  /**
   * Get all loaded pages
   * @returns {Array} Array of page data objects
   */
  getAllPages() {
    return Array.from(this.pages.values())
  }

  /**
   * Check if all pages have been loaded
   * @returns {boolean} True if all pages are complete
   */
  isComplete() {
    return this.completedPages === this.totalPages
  }

  /**
   * Get loading progress
   * @returns {Object} Progress object with completed and total counts
   */
  getProgress() {
    return {
      completed: this.completedPages,
      total: this.totalPages,
      percentage: this.totalPages > 0 ? (this.completedPages / this.totalPages) * 100 : 0
    }
  }
}