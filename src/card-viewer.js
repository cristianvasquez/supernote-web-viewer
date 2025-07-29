'use strict'

// ===================================
// Configuration Constants
// ===================================
const CONFIG = {
  debug: false,
  animation: {
    msPerStep: 1,
    spring: {
      stiffness: 450,
      damping: 45
    }
  },
  layout: {
    promptPaddingBottom: 8,
    promptSizeY: 44 + 8, // includes padding
    prompt1DSizeY: 64 + 8, // includes padding
    boxesGapX: 24,
    boxesGapY: 24,
    boxes1DGapX: 52,
    boxes1DGapY: 28,
    windowPaddingTop: 40,
    gapTopPeek: 40,
    hitArea1DSizeX: 100,
    hoverMagnetFactor: 40,
    browserUIMaxSizeTop: 100,
    browserUIMaxSizeBottom: 150,
    boxMinSizeX: 220,
    maxColumns: 7,
    minBrightness: 0.2 // Minimum brightness to keep pages visible
  }
}

// ===================================
// Global State Management
// ===================================
class ViewerState {
  constructor() {
    this.reset()
  }

  reset() {
    this.scheduledRender = false
    this.isSafari = false
    this.windowSize = { x: 0, y: 0 }
    this.scrollY = 0
    this.pointer = { x: -Infinity, y: -Infinity }
    this.events = { keydown: null, click: null, mousemove: null }
    this.animatedUntilTime = null
    this.reducedMotion = null
    this.anchor = 0
    this.data = []
    this.dummyPlaceholder = null
    this.currentFocusedIndex = null
  }
}

const state = new ViewerState()

// ===================================
// Spring Physics System
// ===================================
class SpringPhysics {
  static create(pos, v = 0, k = CONFIG.animation.spring.stiffness, b = CONFIG.animation.spring.damping) {
    return { pos, dest: pos, v, k, b }
  }

  static step(spring) {
    const t = CONFIG.animation.msPerStep / 1000
    const { pos, dest, v, k, b } = spring
    const Fspring = -k * (pos - dest)
    const Fdamper = -b * v
    const a = Fspring + Fdamper
    spring.v += a * t
    spring.pos += spring.v * t
  }

  static goToEnd(spring) {
    spring.pos = spring.dest
    spring.v = 0
  }

  static forEach(data, fn) {
    for (const d of data) {
      fn(d.x)
      fn(d.y)
      fn(d.sizeX)
      fn(d.sizeY)
      fn(d.scale)
      fn(d.fxFactor)
    }
  }
}

// ===================================
// Layout Calculations
// ===================================
class LayoutCalculator {
  static calculateColumns(containerWidth) {
    const { boxMinSizeX, maxColumns, boxesGapX } = CONFIG.layout
    const cols = Math.max(
      1,
      Math.min(
        maxColumns,
        Math.floor((containerWidth - boxesGapX) / (boxMinSizeX + boxesGapX))
      )
    )
    const boxMaxSizeX = (containerWidth - boxesGapX - cols * boxesGapX) / cols
    return { cols, boxMaxSizeX }
  }

  static calculate2DLayout(data, windowWidth) {
    const { cols, boxMaxSizeX } = this.calculateColumns(windowWidth)
    const { windowPaddingTop, boxesGapY, promptSizeY } = CONFIG.layout

    const boxes2DSizeX = []
    const boxes2DSizeY = []
    const rowsTop = [windowPaddingTop]
    let rowMaxSizeY = 0

    for (let i = 0; i < data.length; i++) {
      const d = data[i]
      const imgMaxSizeY = this.getMaxImageHeight(d.ar, boxMaxSizeX)
      const sizeX = Math.min(d.naturalSizeX, boxMaxSizeX, imgMaxSizeY * d.ar)
      const sizeY = sizeX / d.ar + (d.hasPrompt ? promptSizeY : 0)

      boxes2DSizeX.push(sizeX)
      boxes2DSizeY.push(sizeY)
      rowMaxSizeY = Math.max(rowMaxSizeY, sizeY)

      if (i % cols === cols - 1 || i === data.length - 1) {
        rowsTop.push(rowsTop.at(-1) + rowMaxSizeY + boxesGapY)
        rowMaxSizeY = 0
      }
    }

    return { boxes2DSizeX, boxes2DSizeY, rowsTop, cols, boxMaxSizeX }
  }

  static getMaxImageHeight(aspectRatio, boxMaxSizeX) {
    if (aspectRatio === 1) return boxMaxSizeX * 0.85
    if (aspectRatio < 1) return boxMaxSizeX * 1.05
    return boxMaxSizeX
  }
}

// ===================================
// Hit Testing
// ===================================
class HitTester {
  static test2DMode(data, pointerX, pointerY) {
    for (let i = 0; i < data.length; i++) {
      const { x, y, sizeX, sizeY } = data[i]
      if (
        x.dest <= pointerX &&
        pointerX < x.dest + sizeX.dest &&
        y.dest <= pointerY &&
        pointerY < y.dest + sizeY.dest
      ) {
        return i
      }
    }
    return null
  }

  static test1DMode(data, focused, windowSizeX, pointerX) {
    const { hitArea1DSizeX } = CONFIG.layout
    if (focused > 0 && pointerX <= hitArea1DSizeX) return focused - 1
    if (focused < data.length - 1 && pointerX >= windowSizeX - hitArea1DSizeX)
      return focused + 1
    return null
  }
}

// ===================================
// Navigation Handler
// ===================================
class NavigationHandler {
  static handleKeyboardNavigation(inputCode, focused, currentFocusedIndex, cols, dataLength) {
    if (inputCode === 'Escape') {
      if (focused !== null) {
        state.currentFocusedIndex = focused
      }
      return null
    }

    if (inputCode === 'Space') return focused

    if (
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(inputCode) &&
      focused == null
    ) {
      return currentFocusedIndex !== null ? currentFocusedIndex : 0
    }

    if (inputCode === 'ArrowLeft') return Math.max(0, focused - 1)
    if (inputCode === 'ArrowRight') return Math.min(dataLength - 1, focused + 1)
    if (inputCode === 'ArrowUp') return Math.max(0, focused - cols)
    if (inputCode === 'ArrowDown') return Math.min(dataLength - 1, focused + cols)

    return focused
  }

  static updateBrowserHistory(focused, data) {
    const hash = focused == null ? '' : '#' + data[focused].id
    window.history.pushState(
      null,
      '',
      `${window.location.pathname}${window.location.search}${hash}`
    )
  }
}

// ===================================
// Position Calculator
// ===================================
class PositionCalculator {
  static calculate2DPositions(data, layout, pointerX, pointerY) {
    const { boxes2DSizeX, boxes2DSizeY, rowsTop, cols, boxMaxSizeX } = layout
    const { boxesGapX, hoverMagnetFactor } = CONFIG.layout

    for (let i = 0; i < data.length; i++) {
      const d = data[i]
      const row = Math.floor(i / cols)
      const rowMaxSizeY = rowsTop[row + 1] - CONFIG.layout.boxesGapY - rowsTop[row]

      d.sizeX.dest = boxes2DSizeX[i]
      d.sizeY.dest = boxes2DSizeY[i]
      d.x.dest = boxesGapX + (boxMaxSizeX + boxesGapX) * (i % cols) + (boxMaxSizeX - boxes2DSizeX[i]) / 2
      d.y.dest = rowsTop[row] + (rowMaxSizeY - boxes2DSizeY[i]) / 2
      d.scale.dest = 1
      d.fxFactor.dest = 1
    }

    // Apply hover effect
    const hit = HitTester.test2DMode(data, pointerX, pointerY)
    if (hit != null) {
      const d = data[hit]
      d.x.dest += (pointerX - (d.x.dest + d.sizeX.dest / 2)) / hoverMagnetFactor
      d.y.dest += (pointerY - (d.y.dest + d.sizeY.dest / 2)) / hoverMagnetFactor
      d.scale.dest = 1.02
    }

    return hit != null ? 'zoom-in' : 'auto'
  }

  static calculate1DPositions(data, focused, windowSize, inputCode) {
    const { windowPaddingTop, prompt1DSizeY, promptSizeY, boxes1DGapY, boxes1DGapX, hitArea1DSizeX } = CONFIG.layout
    const img1DSizeY = windowSize.y - windowPaddingTop - (data[focused].hasPrompt ? prompt1DSizeY : 0) - boxes1DGapY
    const box1DMaxSizeX = windowSize.x - boxes1DGapX * 2 - hitArea1DSizeX * 2

    // Calculate starting position for previous pages
    let currentLeft = hitArea1DSizeX + boxes1DGapX
    for (let i = focused - 1; i >= 0; i--) {
      const d = data[i]
      const imgSizeX = Math.min(d.naturalSizeX, box1DMaxSizeX, img1DSizeY * d.ar) * 0.7
      currentLeft -= imgSizeX + boxes1DGapX
    }

    // Apply edge and vertical boosts for navigation feel
    const edgeBoost = this.calculateEdgeBoost(inputCode, focused, data.length)
    const verticalBoost = this.calculateVerticalBoost(inputCode)

    // Position all pages
    for (let i = 0; i < data.length; i++) {
      const d = data[i]
      const isFocused = i === focused
      const scaleFactor = isFocused ? 1 : 0.7
      const imgSizeX = Math.min(d.naturalSizeX, box1DMaxSizeX, img1DSizeY * d.ar) * scaleFactor
      const sizeY = imgSizeX / d.ar + (d.hasPrompt ? (isFocused ? prompt1DSizeY : promptSizeY) : 0)

      d.sizeX.dest = imgSizeX
      d.sizeY.dest = sizeY
      d.y.dest = Math.max(windowPaddingTop, (windowSize.y - sizeY) / 2) + state.scrollY
      d.x.dest = isFocused ? (windowSize.x - imgSizeX) / 2 : currentLeft
      d.x.v += edgeBoost / (isFocused ? 1 : 4)
      d.y.v += verticalBoost / (isFocused ? 1 : 4)
      d.scale.dest = 1
      d.fxFactor.dest = isFocused ? 1 : 0.2

      currentLeft = isFocused ? windowSize.x - hitArea1DSizeX : currentLeft + imgSizeX + boxes1DGapX
    }
  }

  static calculateEdgeBoost(inputCode, focused, dataLength) {
    if (inputCode === 'ArrowLeft' && focused === 0) return 2000
    if (inputCode === 'ArrowRight' && focused === dataLength - 1) return -2000
    return 0
  }

  static calculateVerticalBoost(inputCode) {
    if (inputCode === 'ArrowUp') return -1500
    if (inputCode === 'ArrowDown') return 1500
    return 0
  }
}

// ===================================
// DOM Renderer
// ===================================
class DOMRenderer {
  static updateElements(data, focused, scrollY, windowSize) {
    const { browserUIMaxSizeTop, browserUIMaxSizeBottom, minBrightness, promptSizeY, prompt1DSizeY, promptPaddingBottom } = CONFIG.layout

    for (let i = 0; i < data.length; i++) {
      const d = data[i]
      const { node } = d
      const img = node.children[0]
      const prompt = d.hasPrompt ? node.children[1] : null

      // Always render adjacent pages when in focused mode
      const isAdjacentToFocused = focused != null &&
        (i === focused - 1 || i === focused || i === focused + 1)

      const inView = isAdjacentToFocused || this.isInViewport(d, scrollY, windowSize, browserUIMaxSizeTop, browserUIMaxSizeBottom)

      if (inView) {
        this.applyStyles(node, d, i, focused, minBrightness, data.length)
        this.updatePrompt(prompt, i === focused, promptSizeY, prompt1DSizeY, promptPaddingBottom, d)
        img.style.display = 'block'

        if (node.parentNode == null) {
          document.body.appendChild(node)
        }
      } else if (node.parentNode != null) {
        document.body.removeChild(node)
      }
    }
  }

  static isInViewport(d, scrollY, windowSize, topMargin, bottomMargin) {
    return (
      d.y.pos - scrollY <= windowSize.y + bottomMargin &&
      d.y.pos + d.sizeY.pos - scrollY >= -topMargin &&
      d.x.pos <= windowSize.x &&
      d.x.pos + d.sizeX.pos >= 0
    )
  }

  static applyStyles(node, d, index, focused, minBrightness, totalItems) {
    node.style.width = `${d.sizeX.pos}px`
    node.style.height = `${d.sizeY.pos}px`
    node.style.transform = `translate3d(${d.x.pos}px,${d.y.pos}px,0) scale(${d.scale.pos})`

    // Ensure minimum brightness to prevent "erased" pages
    const brightness = Math.max(minBrightness, d.fxFactor.pos)

    if (focused != null && (index === focused - 1 || index === focused || index === focused + 1)) {
      const blur = Math.max(0, 6 - brightness * 6)
      node.style.filter = `brightness(${brightness * 100}%) blur(${blur}px)`
    } else {
      node.style.filter = `brightness(${brightness * 100}%)`
    }

    node.style.zIndex = index === focused ? totalItems + 999 : index + 1
  }

  static updatePrompt(prompt, isFocused, promptSizeY, prompt1DSizeY, promptPaddingBottom, d) {
    if (!prompt) return

    prompt.style.top = `${d.sizeX.pos / d.ar}px`
    prompt.style.overflowY = isFocused ? 'auto' : 'hidden'
    prompt.style.height = `${(isFocused ? prompt1DSizeY : promptSizeY) - promptPaddingBottom}px`
    prompt.style.lineClamp = prompt.style.webkitLineClamp = isFocused ? 999 : 2
  }

  static updateDocumentStyles(focused, rowsTop) {
    document.body.style.cursor = state.events.mousemove ? 'auto' : document.body.style.cursor
    document.body.style.overflowY = focused == null ? 'auto' : 'hidden'
    state.dummyPlaceholder.style.height = `${rowsTop.at(-1)}px`
  }
}

// ===================================
// Main Render Engine
// ===================================
class RenderEngine {
  static render(now) {
    if (state.data.length === 0) return false

    // Process events
    const inputCode = state.events.keydown?.code ?? null
    this.updatePointer()

    // Get current state
    const newWindowSize = {
      x: document.documentElement.clientWidth,
      y: document.documentElement.clientHeight
    }
    const animationDisabled = state.reducedMotion.matches
    const currentScrollY = state.isSafari ? document.body.scrollTop : window.scrollY
    const currentScrollX = state.isSafari ? document.body.scrollLeft : window.scrollX
    const hashImgId = window.location.hash.slice(1)

    // Determine focused item
    let focused = hashImgId ? state.data.findIndex((d) => d.id === hashImgId) : null
    if (focused === -1) focused = null

    const pointerXLocal = state.pointer.x + currentScrollX
    const pointerYLocal = state.pointer.y + currentScrollY

    // Calculate layout
    const layout = LayoutCalculator.calculate2DLayout(state.data, newWindowSize.x)

    // Handle navigation
    let newFocused = NavigationHandler.handleKeyboardNavigation(
      inputCode,
      focused,
      state.currentFocusedIndex,
      layout.cols,
      state.data.length
    )

    // Handle clicks
    if (state.events.click) {
      newFocused = this.handleClick(focused, pointerXLocal, pointerYLocal, newFocused, newWindowSize.x)
    }

    // Update positions and get cursor
    let cursor = 'auto'
    let newAnchor = state.anchor
    let adjustedScrollTop = currentScrollY

    if (newFocused == null) {
      // 2D Grid Mode
      adjustedScrollTop = this.handle2DMode(
        focused,
        layout,
        pointerXLocal,
        pointerYLocal,
        currentScrollY,
        newWindowSize,
        newAnchor
      )
      cursor = PositionCalculator.calculate2DPositions(state.data, layout, pointerXLocal, pointerYLocal)
    } else {
      // 1D Focused Mode
      cursor = this.handle1DMode(newFocused, newWindowSize, pointerXLocal, pointerYLocal, inputCode)
    }

    // Update scroll positions
    this.updateScrollPositions(adjustedScrollTop, currentScrollY)

    // Animate
    const stillAnimating = this.animate(now, animationDisabled)

    // Update DOM
    DOMRenderer.updateElements(state.data, newFocused, adjustedScrollTop, newWindowSize)
    DOMRenderer.updateDocumentStyles(newFocused, layout.rowsTop)

    // Update cursor
    document.body.style.cursor = cursor

    // Update state
    this.updateState(adjustedScrollTop, newFocused, focused, newAnchor, newWindowSize)

    return stillAnimating
  }

  static updatePointer() {
    if (state.events.click) {
      state.pointer.x = state.events.click.clientX
      state.pointer.y = state.events.click.clientY
    }
    if (state.events.mousemove) {
      state.pointer.x = state.events.mousemove.clientX
      state.pointer.y = state.events.mousemove.clientY
    }
  }

  static handleClick(focused, pointerX, pointerY, newFocused, windowSizeX) {
    const { target } = state.events.click

    if (target.tagName === 'FIGCAPTION') {
      this.selectText(target)
      return newFocused
    }

    if (focused == null) {
      const hitIndex = HitTester.test2DMode(state.data, pointerX, pointerY)
      if (hitIndex !== null && state.data[hitIndex].isUpload && state.data[hitIndex].onUploadClick) {
        state.data[hitIndex].onUploadClick()
        return newFocused
      }
      return hitIndex ?? newFocused
    }

    return HitTester.test1DMode(state.data, focused, windowSizeX, pointerX) ?? newFocused
  }

  static selectText(target) {
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(target)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  static handle2DMode(focused, layout, pointerX, pointerY, currentScrollY, windowSize, currentAnchor) {
    const { rowsTop, boxes2DSizeY } = layout
    let adjustedScrollTop = currentScrollY

    if (focused != null) {
      const focusedTop = rowsTop[Math.floor(focused / layout.cols)]
      const focusedBottom = focusedTop + boxes2DSizeY[focused]
      if (focusedTop <= currentScrollY || focusedBottom >= currentScrollY + windowSize.y) {
        adjustedScrollTop = focusedTop - CONFIG.layout.boxesGapY - CONFIG.layout.gapTopPeek
      }
    }

    // Update anchor if window resized or scrolled significantly
    const anchorY = state.data[state.anchor].y.dest - CONFIG.layout.gapTopPeek
    if (windowSize.x !== state.windowSize.x) {
      adjustedScrollTop = Math.max(0, anchorY)
    }

    if (adjustedScrollTop !== state.scrollY && Math.abs(anchorY - adjustedScrollTop) > windowSize.y / 10) {
      for (let newAnchor = 0; newAnchor < state.data.length; newAnchor += layout.cols) {
        const d = state.data[newAnchor]
        if (d.y.dest + d.sizeY.dest - adjustedScrollTop > windowSize.y / 5) {
          state.anchor = newAnchor
          break
        }
      }
    }

    return adjustedScrollTop
  }

  static handle1DMode(focused, windowSize, pointerX, pointerY, inputCode) {
    PositionCalculator.calculate1DPositions(state.data, focused, windowSize, inputCode)

    // Apply hover effect
    const hit = HitTester.test1DMode(state.data, focused, windowSize.x, pointerX)
    if (hit != null) {
      const d = state.data[hit]
      d.x.dest += (pointerX - (d.x.dest + d.sizeX.dest / 2)) / CONFIG.layout.hoverMagnetFactor
      d.y.dest += (pointerY - (d.y.dest + d.sizeY.dest / 2)) / CONFIG.layout.hoverMagnetFactor
      d.scale.dest = 1.02
      d.fxFactor.dest = 0.5
      return 'zoom-in'
    }

    return 'zoom-out'
  }

  static updateScrollPositions(adjustedScrollTop, currentScrollY) {
    for (const d of state.data) {
      d.y.pos += adjustedScrollTop - currentScrollY
    }
  }

  static animate(now, animationDisabled) {
    let newAnimatedUntilTime = state.animatedUntilTime ?? now
    const steps = Math.floor((now - newAnimatedUntilTime) / CONFIG.animation.msPerStep)
    newAnimatedUntilTime += steps * CONFIG.animation.msPerStep
    let stillAnimating = false

    if (animationDisabled) {
      SpringPhysics.forEach(state.data, SpringPhysics.goToEnd)
    } else {
      SpringPhysics.forEach(state.data, (spring) => {
        for (let i = 0; i < steps; i++) SpringPhysics.step(spring)
        if (Math.abs(spring.v) < 0.01 && Math.abs(spring.dest - spring.pos) < 0.01) {
          SpringPhysics.goToEnd(spring)
        } else {
          stillAnimating = true
        }
      })
    }

    state.animatedUntilTime = stillAnimating ? newAnimatedUntilTime : null
    return stillAnimating
  }

  static updateState(adjustedScrollTop, newFocused, focused, newAnchor, newWindowSize) {
    if (adjustedScrollTop !== state.scrollY) {
      (state.isSafari ? document.body : window).scrollTo({ top: adjustedScrollTop })
    }

    if (newFocused !== focused) {
      NavigationHandler.updateBrowserHistory(newFocused, state.data)
    }

    state.events.keydown = state.events.click = state.events.mousemove = null
    state.anchor = newAnchor
    state.windowSize = newWindowSize
    state.scrollY = adjustedScrollTop
  }
}

// ===================================
// Initialization
// ===================================
class CardViewerInitializer {
  static createCardData(item, index) {
    const ar = item.w / item.h
    const currentWindowSizeX = state.windowSize.x || document.documentElement.clientWidth
    const { cols, boxMaxSizeX } = LayoutCalculator.calculateColumns(currentWindowSizeX)
    const imgMaxSizeY = boxMaxSizeX + 100
    const sizeX = Math.min(item.w, boxMaxSizeX, imgMaxSizeY * ar)
    const sizeY = sizeX / ar + (item.prompt ? CONFIG.layout.promptSizeY : 0)

    const node = document.createElement('div')
    node.className = 'box'
    node.setAttribute('data-page-id', item.id)
    node.style.backgroundImage = `url(${item.lowResSrc})`

    const img = document.createElement('img')
    const children = [img]
    const hasPrompt = item.prompt != null

    if (hasPrompt) {
      const promptNode = document.createElement('figcaption')
      promptNode.className = 'prompt'
      promptNode.textContent = item.prompt
      children.push(promptNode)
    }

    node.append(...children)

    return {
      id: item.id,
      naturalSizeX: item.w,
      ar,
      sizeX: SpringPhysics.create(sizeX),
      sizeY: SpringPhysics.create(sizeY),
      x: SpringPhysics.create(
        (boxMaxSizeX + CONFIG.layout.boxesGapX) * (index % cols) +
        CONFIG.layout.boxesGapX +
        (boxMaxSizeX - sizeX) / 2
      ),
      y: SpringPhysics.create(
        CONFIG.layout.windowPaddingTop +
        Math.floor(index / cols) * (boxMaxSizeX * 0.7 + CONFIG.layout.boxesGapY)
      ),
      scale: SpringPhysics.create(1),
      fxFactor: SpringPhysics.create(1),
      node,
      highResSrc: item.highResSrc,
      isUpload: item.isUpload,
      onUploadClick: item.onUploadClick,
      hasPrompt
    }
  }

  static setupEventListeners() {
    window.addEventListener('resize', scheduleRender)
    window.addEventListener('scroll', scheduleRender, true)
    window.addEventListener('popstate', scheduleRender)

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault()
      }
      state.events.keydown = e
      scheduleRender()
    })

    window.addEventListener('click', (e) => {
      state.events.click = e
      scheduleRender()
    })

    window.addEventListener('mousemove', (e) => {
      state.events.mousemove = e
      scheduleRender()
    })
  }

  static detectEnvironment() {
    state.isSafari = navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome')

    if (state.isSafari) {
      document.body.style.contain = 'layout'
      document.body.style.width = '100vw'
      document.body.style.height = '100vh'
    }

    state.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    state.windowSize = {
      x: document.documentElement.clientWidth,
      y: document.documentElement.clientHeight
    }
    state.scrollY = state.isSafari ? document.body.scrollTop : window.scrollY
  }

  static createPlaceholder() {
    state.dummyPlaceholder = document.createElement('div')
    state.dummyPlaceholder.style.position = 'absolute'
    state.dummyPlaceholder.style.width = '1px'
    document.body.append(state.dummyPlaceholder)
  }

  static setupDebugMode() {
    if (CONFIG.debug) {
      document.documentElement.style.background = 'repeating-linear-gradient(#e66465 0px, #9198e5 300px)'
      document.documentElement.style.height = '100%'
    }
  }
}

// ===================================
// Utility Functions
// ===================================
function scheduleRender() {
  if (!state.scheduledRender) {
    state.scheduledRender = true
    requestAnimationFrame(function (now) {
      state.scheduledRender = false
      if (RenderEngine.render(now)) scheduleRender()
    })
  }
}

// ===================================
// Public API
// ===================================
export function initCardViewer(initialData) {
  // Clear existing data and DOM nodes
  state.data.forEach((d) => {
    if (d.node && d.node.parentNode) {
      document.body.removeChild(d.node)
    }
  })

  // Create new card data
  state.data = initialData.map((item, index) =>
    CardViewerInitializer.createCardData(item, index)
  )

  // Force initial positions to be set immediately
  SpringPhysics.forEach(state.data, SpringPhysics.goToEnd)

  scheduleRender()
}

export function updateCardImage(id, highResSrc, width, height) {
  const card = state.data.find((d) => d.id === id)
  if (!card) return

  card.node.children[0].src = highResSrc
  card.naturalSizeX = width
  card.ar = width / height

  // Recalculate size based on new dimensions
  const currentWindowSizeX = state.windowSize.x || document.documentElement.clientWidth
  const { boxMaxSizeX } = LayoutCalculator.calculateColumns(currentWindowSizeX)
  const imgMaxSizeY = boxMaxSizeX + 100
  const newSizeX = Math.min(card.naturalSizeX, boxMaxSizeX, imgMaxSizeY * card.ar)
  const newSizeY = newSizeX / card.ar + (card.hasPrompt ? CONFIG.layout.promptSizeY : 0)

  card.sizeX.dest = newSizeX
  card.sizeY.dest = newSizeY

  scheduleRender()
}

export function initializeCardViewer() {
  CardViewerInitializer.detectEnvironment()
  CardViewerInitializer.createPlaceholder()
  CardViewerInitializer.setupDebugMode()
  CardViewerInitializer.setupEventListeners()

  // Reset state
  state.pointer = { x: -Infinity, y: -Infinity }
  state.events = { keydown: null, click: null, mousemove: null }

  scheduleRender()
}
