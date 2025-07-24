# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a web-based Supernote file viewer that processes .note files entirely in the browser using Web Workers for parallel processing. The app converts Supernote pages to PNG images and displays them in a responsive grid layout.

## Commands

### Development
- `npm run dev` - Start Vite development server
- `npm run build` - Build for production

### Testing/Playground
- `node playground/test-markdown.js` - Convert test.note to markdown with embedded images

## Architecture

### Core Components

**Main Application (index.html)**
- Single-page app with inline JavaScript module
- Uses `supernote-typescript` library for .note file parsing
- Implements multi-worker architecture for parallel page processing
- Dynamic worker pool based on `navigator.hardwareConcurrency` (max 8 workers)

**Worker System (src/worker.js)**
- Web Worker for offloading image conversion from main thread
- Each worker processes individual pages using `toImage()` from supernote-typescript
- Returns PNG buffer data to main thread for display

**Processing Flow**
1. User uploads .note file → converted to ArrayBuffer
2. SupernoteX instance created from Uint8Array
3. Worker pool distributes pages across available workers
4. Each worker converts page to PNG buffer
5. Main thread converts buffer to base64 and displays as images

### Key Dependencies

- `supernote-typescript` - Core library for parsing Supernote files and image conversion
- `vite` - Build tool and dev server
- `vite-plugin-node-polyfills` - Browser compatibility for Node.js APIs

### Build Configuration

**Vite Config (vite.config.js)**
- Base path set to `'./'` for GitHub Pages deployment
- ES module format for workers
- Global polyfills for browser compatibility

### File Structure

- `index.html` - Main application with embedded JavaScript
- `src/worker.js` - Web Worker for image processing
- `playground/` - Test utilities and sample files
  - `test-markdown.js` - CLI tool to convert .note to markdown
  - `input/test.note` - Sample Supernote file
  - `output/` - Generated images and markdown

## Development Notes

- All processing happens client-side (privacy-focused)
- Worker pool size auto-adjusts based on hardware capabilities
- Responsive grid layout with adjustable image width slider
- Error handling in workers posts error messages back to main thread