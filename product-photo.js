const input = document.querySelector('#newimage');
const form = document.querySelector('#publish-form');
const preview = document.querySelector('#photo-preview');
const status = document.querySelector('#photo-status');
const download = document.querySelector('#photo-download');
const remove = document.querySelector('#photo-remove');

let revision = 0;
let worker;

function preparePhoto(file) {
  return new Promise((resolve, reject) => {
    worker ??= new Worker(new URL('./product-photo-worker.js?v=1', import.meta.url), { type: 'module' });
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
