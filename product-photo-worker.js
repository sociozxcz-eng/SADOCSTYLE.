import { pipeline, RawImage } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

let segmenter;

async function whiteBackground(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 720 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  try {
    context.drawImage(bitmap, 0, 0, width, height);
  } finally {
    bitmap.close();
  }

  const pixels = context.getImageData(0, 0, width, height);
  segmenter ??= pipeline('background-removal', 'onnx-community/ormbg-ONNX', { dtype: 'q8', device: 'wasm' });
  const removeBackground = await segmenter;
  const [subject] = await removeBackground(new RawImage(pixels.data, width, height, 4));
  const cutout = new OffscreenCanvas(subject.width, subject.height);
  cutout.getContext('2d').putImageData(
    new ImageData(new Uint8ClampedArray(subject.data), subject.width, subject.height), 0, 0
  );
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.drawImage(cutout, 0, 0, width, height);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.88 });
}

self.onmessage = async ({ data: file }) => {
  try {
    self.postMessage({ image: await whiteBackground(file) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
