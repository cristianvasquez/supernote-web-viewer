// VSCode Extension Example (Extension Side)
// This shows how the VSCode extension would process .note files and send data to the webview

const vscode = require('vscode')
const fs = require('fs')
const { SupernoteX } = require('supernote-typescript')

class SupernoteViewerProvider {
    constructor(context) {
        this.context = context
        this.currentPanel = null
    }

    async openSupernoteFile(uri) {
        // Create or show webview panel
        if (this.currentPanel) {
            this.currentPanel.reveal()
        } else {
            this.currentPanel = vscode.window.createWebviewPanel(
                'supernoteViewer',
                'Supernote Viewer',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    localResourceRoots: [
                        vscode.Uri.joinPath(this.context.extensionUri, 'webview')
                    ]
                }
            )

            // Handle webview disposal
            this.currentPanel.onDidDispose(() => {
                this.currentPanel = null
            })

            // Set webview HTML content
            this.currentPanel.webview.html = this.getWebviewContent()

            // Handle messages from webview
            this.currentPanel.webview.onDidReceiveMessage(
                message => this.handleWebviewMessage(message),
                undefined,
                this.context.subscriptions
            )
        }

        // Process the .note file
        await this.processSupernoteFile(uri)
    }

    async processSupernoteFile(uri) {
        try {
            // Read the .note file
            const fileBuffer = fs.readFileSync(uri.fsPath)
            const note = new SupernoteX(new Uint8Array(fileBuffer))
            const totalPages = note.pages.length

            console.log(`Processing ${totalPages} pages from ${uri.fsPath}`)

            // Tell webview to initialize with total pages
            this.currentPanel.webview.postMessage({
                type: 'start-processing',
                totalPages
            })

            // Process pages one by one (this simulates the async nature)
            for (let pageIndex = 1; pageIndex <= totalPages; pageIndex++) {
                // Convert page to image (this runs in Node.js context)
                const imageBuffer = await note.toImage(pageIndex)
                const base64Data = imageBuffer.toString('base64')

                // Get image dimensions (you might need a library like 'sharp' for this)
                // For this example, we'll use default dimensions
                const width = 800
                const height = 600

                // Send processed page to webview
                this.currentPanel.webview.postMessage({
                    type: 'add-page',
                    pageNumber: pageIndex,
                    base64Data,
                    width,
                    height
                })

                // Optional: Add delay to show progressive loading
                await new Promise(resolve => setTimeout(resolve, 100))
            }

            console.log('All pages processed successfully')
        } catch (error) {
            console.error('Error processing Supernote file:', error)
            vscode.window.showErrorMessage(`Failed to process Supernote file: ${error.message}`)
        }
    }

    handleWebviewMessage(message) {
        switch (message.type) {
            case 'webview-ready':
                console.log('Webview is ready')
                break

            case 'ready-for-pages':
                console.log('Webview is ready to receive pages')
                break

            case 'progress':
                // Update VSCode progress indicator
                console.log(`Progress: ${message.completed}/${message.total} (${message.percentage.toFixed(1)}%)`)
                break

            case 'page-complete':
                console.log(`Page ${message.pageNumber} rendered: ${message.width}x${message.height}`)
                break

            default:
                console.warn('Unknown message from webview:', message.type)
        }
    }

    getWebviewContent() {
        const webviewUri = vscode.Uri.joinPath(this.context.extensionUri, 'webview')
        const baseUri = this.currentPanel.webview.asWebviewUri(webviewUri)

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Supernote Viewer</title>
    <link rel="stylesheet" href="${baseUri}/src/style.css"/>
</head>
<body>
    <script type="module" src="${baseUri}/examples/vscode-webview-example.js"></script>
</body>
</html>`
    }
}

// Extension activation function
function activate(context) {
    const provider = new SupernoteViewerProvider(context)

    // Register command to open .note files
    const openCommand = vscode.commands.registerCommand(
        'supernote.openFile',
        (uri) => provider.openSupernoteFile(uri)
    )

    // Register file association for .note files
    const fileAssociation = vscode.workspace.onDidOpenTextDocument((document) => {
        if (document.fileName.endsWith('.note')) {
            provider.openSupernoteFile(document.uri)
        }
    })

    context.subscriptions.push(openCommand, fileAssociation)
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
}

// Example package.json contributions:
/*
{
    "contributes": {
        "commands": [
            {
                "command": "supernote.openFile",
                "title": "Open with Supernote Viewer"
            }
        ],
        "menus": {
            "explorer/context": [
                {
                    "when": "resourceExtname == .note",
                    "command": "supernote.openFile",
                    "group": "navigation"
                }
            ]
        }
    }
}
*/