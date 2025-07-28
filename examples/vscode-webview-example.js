// VSCode Extension Webview Example
// This shows how a VSCode extension would use the SupernoteViewer component

// In your webview HTML:
/*
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Supernote Viewer</title>
    <link rel="stylesheet" href="./src/style.css"/>
</head>
<body>
    <script type="module" src="./vscode-webview-example.js"></script>
</body>
</html>
*/

import { SupernoteViewer } from '../lib/SupernoteViewer.js'

// Initialize the viewer without upload card for VSCode extension
const viewer = new SupernoteViewer({
    showUploadCard: false, // VSCode extension handles file selection
    onProgress: (completed, total) => {
        // Send progress updates to VSCode extension
        vscode.postMessage({
            type: 'progress',
            completed,
            total,
            percentage: (completed / total) * 100
        })
        console.log(`Progress: ${completed}/${total} pages`)
    },
    onPageComplete: (pageNumber, src, width, height) => {
        // Notify VSCode extension when a page is complete
        vscode.postMessage({
            type: 'page-complete',
            pageNumber,
            width,
            height
        })
        console.log(`Page ${pageNumber} loaded: ${width}x${height}`)
    }
})

// VSCode webview API (provided by VSCode)
const vscode = acquireVsCodeApi()

// Listen for messages from the VSCode extension
window.addEventListener('message', event => {
    const message = event.data

    switch (message.type) {
        case 'start-processing':
            // VSCode extension tells us to start processing a file
            const { totalPages } = message
            console.log(`Starting to process ${totalPages} pages`)
            viewer.initializePages(totalPages)
            
            // Notify extension we're ready
            vscode.postMessage({
                type: 'ready-for-pages'
            })
            break

        case 'add-page':
            // VSCode extension sends us a processed page
            const { pageNumber, base64Data, width, height } = message
            viewer.addPageImage(pageNumber, base64Data, width, height)
            break

        case 'reset':
            // Reset the viewer
            viewer.reset()
            break

        default:
            console.warn('Unknown message type:', message.type)
    }
})

// Notify VSCode extension that webview is ready
vscode.postMessage({
    type: 'webview-ready'
})

console.log('VSCode Supernote Webview initialized')