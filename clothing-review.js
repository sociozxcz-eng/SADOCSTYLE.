const table = 'clothing_listings';
const fields = 'id,name,price,description,image,status';
const form = document.getElementById('publish-form');
const submit = document.getElementById('submit-clothing');
const notice = document.getElementById('clothing-notice');
const feedback = document.getElementById('clothing-feedback');
const queue = document.getElementById('clothing-review');
const pending = document.getElementById('clothing-pending');
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
    const owner = user?.app_metadata?.sadoc_role === 'owner';
    queue.hidden = true;
    submit.hidden = true;
    pending.replaceChildren();
    const result = await client.from(table).select(fields)
      .eq('status', 'approved').order('created_at', { ascending: false }).limit(20);
    if (request !== refreshId) return;
    available = !result.error;
    if (!available) return;
    catalog.replaceChildren(...result.data.map(listingCard));
    publicSection.hidden = !result.data.length;
    notice.textContent = 'Solo se aprueban anuncios cuya foto principal muestre ropa.';
    submit.hidden = !signedIn;
    if (!signedIn) feedback.textContent = 'Inicia sesión en Cuenta de vendedor para enviar tu anuncio.';
    else feedback.textContent = '';
    if (!owner) return;

    const review = await client.from(table).select(fields)
      .eq('status', 'pending').order('created_at', { ascending: true }).limit(20);
    if (request !== refreshId) return;
    queue.hidden = false;
    const state = document.getElementById('clothing-review-state');
    state.textContent = review.error ? 'No se pudo cargar la revisión.' :
      review.data.length ? 'Aprueba el anuncio si la foto principal muestra ropa.' : 'No hay anuncios pendientes.';
    if (review.error) return;
    pending.replaceChildren(...review.data.map(listing => {
      const card = listingCard(listing);
      const actions = document.createElement('div');
      actions.className = 'sizes';
      for (const [label, status] of [['Aprobar', 'approved'], ['Rechazar', 'rejected']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'outline';
        button.textContent = label;
        button.onclick = async () => {
          for (const control of actions.children) control.disabled = true;
          const update = await client.from(table).update({ status }).eq('id', listing.id)
            .eq('status', 'pending').select('id').maybeSingle();
          if (update.error) {
            for (const control of actions.children) control.disabled = false;
            state.textContent = 'No se pudo guardar la revisión. Inténtalo nuevamente.';
            return;
          }
          if (request === refreshId) await refresh(currentUser);
        };
        actions.append(button);
      }
      card.append(actions);
      return card;
    }));
  }

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
      if (currentUser?.app_metadata?.sadoc_role === 'owner') await refresh(currentUser);
      feedback.textContent = 'Anuncio enviado. Aparecerá en el catálogo cuando el dueño apruebe la foto.';
    } finally {
      submit.disabled = false;
    }
  });

  return refresh;
}
