const table = 'clothing_listings';
const fields = 'id,name,price,description,image,status';
const form = document.getElementById('publish-form');
const submit = document.getElementById('submit-clothing');
const notice = document.getElementById('clothing-notice');
const feedback = document.getElementById('clothing-feedback');
function listingCard(listing) {
  const card = document.createElement('article');
  card.className = 'product';
  const wrap = document.createElement('div');
  wrap.className = 'imgwrap';
  const body = document.createElement('div');
  body.className = 'pc';
  const image = document.createElement('img');
  if (/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(listing.image)) image.src = listing.image;
  image.alt = listing.name;
  image.loading = 'lazy';
  const title = document.createElement('h3');
  title.textContent = listing.name;
  const price = document.createElement('p');
  price.className = 'price';
  price.textContent = '$' + Number(listing.price).toLocaleString('es-CO') + ' COP';
  const description = document.createElement('p');
  description.textContent = listing.description;
  wrap.append(image);
  body.append(title, price, description);
  card.append(wrap, body);
  const view = document.createElement('button');
  view.type = 'button';
  view.className = 'blackbutton';
  view.textContent = 'VER';
  view.setAttribute('aria-label', 'Ver ' + listing.name);
  view.onclick = () => showListing(listing, image.src, price.textContent);
  body.append(view);
  return card;
}

const dialog = document.getElementById('listing-dialog');
const options = dialog.querySelector('details');
dialog.querySelector('.listing-back').onclick = () => dialog.close();
dialog.addEventListener('close', () => { options.open = false; });
dialog.addEventListener('click', event => {
  if (!options.contains(event.target)) options.open = false;
});
window.addEventListener('hashchange', () => { if (dialog.open) dialog.close(); });

function showListing(listing, src, price) {
  dialog.querySelector('h2').textContent = listing.name;
  const photo = dialog.querySelector('img');
  photo.src = src;
  photo.alt = listing.name;
  dialog.querySelector('.listing-price').textContent = price;
  dialog.querySelector('.listing-description').textContent = listing.description;
  dialog.querySelector('.listing-report').onclick = () => {
    dialog.close();
    window.view('soporte');
    window.dispatchEvent(new CustomEvent('sadoc-report', {detail: {name:listing.name, id:listing.id}}));
  };
  dialog.showModal();
}

export function connectClothingReview(client) {
  let currentUser;
  let signedIn = false;
  let available = false;
  let refreshId = 0;

  const list = document.getElementById('mis-lista');
  const statusLine = document.getElementById('mis-aviso');
  const more = document.getElementById('mis-mas');
  const reload = document.getElementById('mis-actualizar');
  const labels = {pending:'Esperando comprobación', approved:'Aprobada · Visible en Productos', rejected:'Rechazada · Sin publicar'};
  let historyRequest = 0;
  async function loadMine(append = false) {
    const request = ++historyRequest;
    const offset = append ? list.childElementCount : 0;
    if (!append) list.replaceChildren();
    more.hidden = true;
    reload.hidden = !currentUser;
    document.getElementById('mis-login').hidden = Boolean(currentUser);
    statusLine.textContent = currentUser ? 'Consultando tus prendas…' : 'Inicia sesión con la cuenta que usaste para enviar tu producto.';
    if (!currentUser) return;
    try {
      const {data,error} = await client.rpc('mis_publicaciones',{desde:offset});
      if (request !== historyRequest) return;
      if (error) throw error;
      for (const item of data.slice(0,6)) {
        const row = document.createElement('article');
        const img = document.createElement('img');
        img.src = item.image;
        img.alt = item.name;
        const body = document.createElement('div');
        const name = document.createElement('h3');
        name.textContent = item.name;
        const details = document.createElement('p');
        details.textContent = '$' + Number(item.price).toLocaleString('es-CO') + ' COP · ' + new Date(item.created_at).toLocaleDateString('es-CO',{timeZone:'America/Bogota'});
        const state = document.createElement('strong');
        state.className = item.status;
        state.textContent = labels[item.status];
        body.append(name,details,state);
        row.append(img,body);
        list.append(row);
      }
      more.hidden = data.length <= 6;
      statusLine.textContent = list.childElementCount ? '' : 'Todavía no has enviado productos a revisión.';
    } catch {
      if (request === historyRequest) statusLine.textContent = 'No pudimos cargar tus prendas. Toca Actualizar estado para intentarlo otra vez.';
    }
  }
  window.addEventListener('abrir-mis-publicaciones', () => loadMine());
  more.onclick = () => loadMine(true);
  reload.onclick = () => loadMine();

  async function refresh(user) {
    if (user?.id !== currentUser?.id) {
      historyRequest++;
      list.replaceChildren();
    }
    currentUser = user;
    if (location.hash === '#mis-publicaciones') loadMine();
    const request = ++refreshId;
    signedIn = Boolean(user);
    document.getElementById('clothing-login').hidden = signedIn;
    submit.hidden = true;
    const result = await client.from(table).select(fields)
      .eq('status', 'approved').order('created_at', { ascending: false }).limit(20);
    if (request !== refreshId) return;
    available = !result.error;
    if (!available) {
      notice.textContent = 'No se pudo conectar con el catálogo. Guarda un borrador o vuelve a cargar la página.';
      return;
    }
    window.sellerCatalogCards = () => result.data.map(listingCard);
    window.renderProducts();
    notice.textContent = 'Puedes publicar ropa, velas y otros productos de venta libre. Al empezar puedes enviar un producto al día. Revisamos la foto y el texto para detectar artículos prohibidos, ilegales o para mayores de 18 años.';
    submit.hidden = !signedIn;
    feedback.textContent = '';

  }
  window.addEventListener('abrir-catalogo', () => refresh(currentUser).catch(console.error));
  
  form.addEventListener('submit', async event => {
    if (event.submitter !== submit) return;
    event.preventDefault();
    if (!signedIn || !available || submit.disabled) return;
    const photo = document.getElementById('photo-download');
    if (photo.hidden) {
      feedback.textContent = 'Espera a que la foto del producto esté lista.';
      return;
    }
    submit.disabled = true;
    feedback.textContent = 'Enviando a revisión…';
    try {
      const { error } = await client.from(table).insert({
        name: document.getElementById('newname').value.trim(),
        price: Number(document.getElementById('newprice').value),
        description: document.getElementById('newdesc').value.trim(),
        image: photo.href
      });
      if (error) {
        feedback.textContent = error.message === 'SADOC_DAILY_LIMIT'
          ? 'Ya enviaste un producto hoy. Puedes enviar otro mañana, según la hora de Colombia.'
          : 'No se pudo enviar el anuncio. Revisa los datos y vuelve a intentar.';
        return;
      }
      form.reset();
      await refresh(currentUser);
      window.view('mis-publicaciones');
    } catch {
      feedback.textContent = 'Se perdió la conexión. Revisa tus anuncios antes de volver a enviarlo.';
    } finally {
      submit.disabled = false;
    }
  });

  return refresh;
}
