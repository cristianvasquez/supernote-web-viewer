import { SupernoteX, toImage } from 'supernote-typescript';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testSupernoteProcessing() {
  try {
    const noteFilePath = resolve(__dirname, '../example/test.note');
    const arrayBuffer = readFileSync(noteFilePath);
    const note = new SupernoteX(new Uint8Array(arrayBuffer));

    console.log(`Processing Supernote file with ${note.pages.length} pages.`);

    // Process the first page as an example
    if (note.pages.length > 0) {
      const pageIndex = 1; // Supernote pages are 1-indexed
      const [image] = await toImage(note, [pageIndex]);
      const imageBuffer = await image.toBuffer('image/png');

      console.log(`Processed page ${pageIndex}. Image buffer size: ${imageBuffer.byteLength} bytes.`);

      // For a more complete test, we could try to get dimensions here if toImage provided them.
      // Since it doesn't directly, we'll just confirm buffer creation.

      // Simulate the data structure for card-viewer.js
      const mockCardData = {
        id: `page-${pageIndex}`,
        w: 800, // Placeholder, actual dimensions would come from image processing
        h: 600, // Placeholder
        prompt: `Page ${pageIndex}`,
        lowResSrc: '',
        highResSrc: `data:image/png;base64,${Buffer.from(imageBuffer).toString('base64')}`
      };

      console.log('Mock card data for page 1:', mockCardData);

    } else {
      console.log('No pages found in the Supernote file.');
    }

  } catch (error) {
    console.error('Error during Supernote processing test:', error);
  }
}

testSupernoteProcessing();
