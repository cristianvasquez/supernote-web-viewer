import { SupernoteX, toImage } from 'supernote-typescript'
import { promises as fs } from 'fs'

const data = await fs.readFile('playground/input/test.note')
const uint8Array = new Uint8Array(data.buffer)
let note = new SupernoteX(uint8Array)

let index = 1
for (const current of note.pages) {
  // import { Image } from 'image-js';
  let [image] = await toImage(note, [index])
  await image.save(`playground/output/note-${index}.png`)
  index = index + 1
}
