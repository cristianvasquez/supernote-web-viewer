# VSCode Extension Integration Examples

This directory contains examples showing how to integrate the SupernoteViewer component with a VSCode extension.

## Architecture

The refactored SupernoteViewer separates concerns:

- **VSCode Extension** (`vscode-extension-example.js`): Handles file processing using Node.js capabilities
- **Web Viewer** (`vscode-webview-example.js`): Handles display and interaction using sophisticated UI

## Communication Flow

```
VSCode Extension                    Web Viewer
      │                                 │
      ├─ Read .note file                │
      ├─ Create SupernoteX instance     │
      ├─ Send 'start-processing' ───────┤
      │                                 ├─ Initialize grid with placeholders
      │                          ───────┤ Send 'ready-for-pages'
      ├─ Process page 1                 │
      ├─ Send 'add-page' (page 1) ──────┤
      │                                 ├─ Display page 1 with animation
      ├─ Process page 2                 │
      ├─ Send 'add-page' (page 2) ──────┤
      │                                 ├─ Display page 2 with animation
      └─ Continue until all pages...    └─ Update progress indicators
```

## Key Benefits

1. **Separation of Concerns**: File processing in Node.js, UI in browser
2. **Progressive Loading**: Pages appear as they're processed
3. **Memory Efficient**: Only processed images are kept in memory
4. **Responsive UI**: Sophisticated card grid with animations
5. **Reusable Component**: Same viewer can be used in web and VSCode

## Usage in VSCode Extension

### 1. Include the SupernoteViewer files in your extension:
```
extension/
├── webview/
│   ├── lib/SupernoteViewer.js
│   ├── src/card-viewer.js
│   ├── src/style.css
│   └── examples/vscode-webview-example.js
└── src/extension.js
```

### 2. Initialize the viewer without upload functionality:
```javascript
const viewer = new SupernoteViewer({
    showUploadCard: false, // VSCode handles file selection
    onProgress: (completed, total) => {
        // Report progress to extension
    }
})
```

### 3. Send pages one by one from the extension:
```javascript
// In extension code
viewer.initializePages(totalPages)
// ... process each page ...
viewer.addPageImage(pageNumber, base64Data, width, height)
```

## API Reference

### SupernoteViewer Methods

- `initializePages(totalPages)` - Initialize grid with empty placeholders
- `addPageImage(pageNumber, base64Data, width, height)` - Add processed page
- `reset()` - Reset to initial state
- `getProgress()` - Get loading progress
- `isComplete()` - Check if all pages loaded

### Message Types (Extension ↔ Webview)

**Extension → Webview:**
- `start-processing` - Begin processing with total pages
- `add-page` - Send processed page data
- `reset` - Reset viewer state

**Webview → Extension:**
- `webview-ready` - Webview initialized
- `ready-for-pages` - Ready to receive pages
- `progress` - Progress update
- `page-complete` - Page rendering complete