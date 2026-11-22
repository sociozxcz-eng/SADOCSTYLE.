const table = 'clothing_listings';
const fields = 'id,name,price,description,image,status';
const form = document.getElementById('publish-form');
const submit = document.getElementById('submit-clothing');
const notice = document.getElementById('clothing-notice');
const feedback = document.getElementById('clothing-feedback');
const publicSection = document.getElementById('clothing-catalog');
const catalog = document.getElementById('clothing-approved');

function listingCard(listing) {
  const card = document.createElement('article');
  card.className = 'frame';
  const image = document.createElement('img');
  if (/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(listing.image)) image.src = listing.image;
  image.alt = listing.name;
  image.loading = 'lazy';
  const title = document.createElement('h3');
  title.textContent = listing.name;
  const price = document.createElement('p');
  price.textContent = '$' + Number(listing.price).toLocaleString('es-CO') + ' COP';
  const description = document.createElement('p');
  description.textContent = listing.description;
  card.append(image, title, price, description);
  if (listing.status === 'approved') {
    const report = document.createElement('a');
    report.className = 'outline';
    report.textContent = 'Reportar publicación';
    report.href = window.sadocSupportUrl('Hola SADOCSTYLE, quiero reportar una publicación.\nProducto: ' + listing.name + '\nReferencia: ' + listing.id + '\nMotivo: ');
    report.target = '_blank';
    report.rel = 'noopener';
    card.append(report);
  }
  return card;
}

export function connectClothingReview(client) {
  let currentUser;
  let signedIn = false;
  let available = false;
  let refreshId = 0;

  async function refresh(user) {
    currentUser = user;
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
    catalog.replaceChildren(...result.data.map(listingCard));
    publicSection.hidden = !result.data.length;
    notice.textContent = 'La IA revisa las fotos por turnos. Si reconoce una prenda, tu anuncio aparecerá en Productos.';
    submit.hidden = !signedIn;
    feedback.textContent = '';
    if (signedIn) {
      const own = await client.from(table).select('name,status').in('status', ['pending','rejected'])
        .order('created_at', {ascending:false}).limit(10);
      if (request === refreshId && !own.error) feedback.textContent = own.data.map(item =>
        item.name + ' · ' + (item.status === 'pending' ? 'En revisión automática' : 'No publicado. Prueba con una foto más clara de la prenda.')).join(' | ');
    }
  }
  window.addEventListener('hashchange', () => {
    if (['#productos','#publicar'].includes(location.hash)) refresh(currentUser).catch(console.error);
  });
  
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
        feedback.textContent = 'No se pudo enviar el anuncio. Revisa los datos y vuelve a intentar.';
        return;
      }
      form.reset();
      await refresh(currentUser);
      feedback.textContent = 'Anuncio recibido. La IA revisará la foto y publicará la prenda si cumple los criterios.';
    } catch {
      feedback.textContent = 'Se perdió la conexión. Revisa tus anuncios antes de volver a enviarlo.';
    } finally {
      submit.disabled = false;
    }
  });

  return refresh;
}
