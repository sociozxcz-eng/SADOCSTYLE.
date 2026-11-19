const input = document.querySelector('#newimage');
const form = document.querySelector('#publish-form');
const preview = document.querySelector('#photo-preview');
const status = document.querySelector('#photo-status');
const download = document.querySelector('#photo-download');
const remove = document.querySelector('#photo-remove');

let revision = 0;
let model;

async function preparePhoto(file) {
  const { pipeline, RawImage } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
  model ??= pipeline('background-removal', 'onnx-community/ormbg-ONNX', { dtype: 'q8', device: 'wasm' })
    .catch(error => { model = undefined; throw error; });

  const bitmap = await createImageBitmap(file);
  const source = document.createElement('canvas');
  try {
    const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
    source.width = Math.max(1, Math.round(bitmap.width * scale));
    source.height = Math.max(1, Math.round(bitmap.height * scale));
    source.getContext('2d').drawImage(bitmap, 0, 0, source.width, source.height);
  } finally {
    bitmap.close();
  }

  const removeBackground = await model;
  const cutouts = await removeBackground(await RawImage.fromCanvas(source));
  const subject = cutouts[0].toCanvas();
  const output = document.createElement('canvas');
  output.width = subject.width;
  output.height = subject.height;
  const context = output.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(subject, 0, 0);
  return output.toDataURL('image/jpeg', 0.88);
}

function clearPreview() {
  revision++;
  preview.hidden = true;
  preview.removeAttribute('src');
  download.hidden = true;
  download.removeAttribute('href');
  remove.hidden = true;
}

remove.addEventListener('click', () => {
  input.value = '';
  clearPreview();
  status.textContent = 'Foto quitada. Puedes elegir otra.';
  if (!input.disabled) input.focus();
});

form.addEventListener('reset', () => {
  clearPreview();
  status.textContent = 'El fondo se quitará automáticamente al elegir una foto.';
});

input.addEventListener('change', async () => {
  clearPreview();
  const file = input.files[0];
  const request = revision;
  if (!file) {
    status.textContent = 'Selecciona una foto del producto.';
    return;
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) {
    status.textContent = 'Elige una foto JPG, PNG o WebP de hasta 20 MB.';
    return;
  }

  input.disabled = true;
  remove.hidden = false;
  status.textContent = 'Quitando el fondo… La primera vez se descarga el modelo y puede tardar.';
  try {
    const image = await preparePhoto(file);
    if (request !== revision) return;
    preview.src = image;
    preview.hidden = false;
    download.href = image;
    download.hidden = false;
    remove.hidden = false;
    status.textContent = 'Foto lista. Revísala antes de guardarla o descárgala.';
  } catch (error) {
    if (request !== revision) return;
    console.error('No se pudo preparar la foto', error);
    input.value = '';
    remove.hidden = true;
    status.textContent = 'No se pudo quitar el fondo. Revisa tu conexión y vuelve a elegir la foto.';
  } finally {
    input.disabled = false;
  }
});
