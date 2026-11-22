const input = document.querySelector('#newimage');
const form = document.querySelector('#publish-form');
const preview = document.querySelector('#photo-preview');
const status = document.querySelector('#photo-status');
const download = document.querySelector('#photo-download');
const remove = document.querySelector('#photo-remove');

let revision = 0;
let worker;
let originalUrl;

function releaseOriginal() {
  if (originalUrl) URL.revokeObjectURL(originalUrl);
  originalUrl = undefined;
}

function preparePhoto(file) {
  return new Promise((resolve, reject) => {
    worker ??= new Worker(new URL('./product-photo-worker.js?v=2', import.meta.url), { type: 'module' });
    const activeWorker = worker;
    const finish = () => {
      clearTimeout(timeout);
      activeWorker.onmessage = null;
      activeWorker.onerror = null;
    };
    const fail = error => {
      finish();
      activeWorker.terminate();
      worker = undefined;
      reject(error);
    };
    const timeout = setTimeout(() => fail(new Error('El recorte tardó demasiado.')), 180000);
    activeWorker.onerror = event => fail(new Error(event.message || 'No se pudo iniciar el recorte.'));
    activeWorker.onmessage = ({ data }) => {
      if (!data.image) {
        fail(new Error(data.error));
        return;
      }
      finish();
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(data.image);
    };
    activeWorker.postMessage(file);
  });
}

function clearPreview() {
  revision++;
  releaseOriginal();
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

  originalUrl = URL.createObjectURL(file);
  preview.src = originalUrl;
  preview.hidden = false;
  input.disabled = true;
  remove.hidden = false;
  status.textContent = 'Foto original. Estamos quitando el fondo; la primera vez puede tardar.';
  try {
    const image = await preparePhoto(file);
    if (request !== revision) return;
    releaseOriginal();
    preview.src = image;
    preview.hidden = false;
    download.href = image;
    download.hidden = false;
    remove.hidden = false;
    status.textContent = 'Foto lista. Revísala antes de guardarla o descárgala.';
  } catch (error) {
    if (request !== revision) return;
    console.error('No se pudo preparar la foto', error);
    try {
      await preview.decode();
      if (request !== revision) return;
      const scale = Math.min(1, 640 / Math.max(preview.naturalWidth, preview.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(preview.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(preview.naturalHeight * scale));
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(preview, 0, 0, canvas.width, canvas.height);
      download.href = canvas.toDataURL('image/jpeg', 0.78);
      download.download = 'foto-producto.jpg';
      download.hidden = false;
      status.textContent = 'Tu foto está lista con el fondo original. Puedes enviarla a revisión.';
    } catch {
      input.value = '';
      status.textContent = 'No se pudo abrir la foto. Elige otra imagen.';
    }
  } finally {
    input.disabled = false;
  }
});
