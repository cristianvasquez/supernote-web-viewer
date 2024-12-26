export default class SupernoteWorker {
  constructor() {
    this.worker = new Worker(
      new URL('./worker-impl.js?v=' + Date.now(), import.meta.url),
      { type: 'module' }
    )
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
