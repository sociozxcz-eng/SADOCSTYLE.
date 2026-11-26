import { connectClothingReview } from './clothing-review.js?v=productos2';

const storeUrl = 'https://sociozxcz-eng.github.io/SADOCSTYLE./';

const login = document.querySelector('#seller-login');
const signup = document.querySelector('#seller-signup');
const edit = document.querySelector('#seller-edit');
const signout = document.querySelector('#seller-signout');
const message = document.querySelector('#seller-message');
const guest = document.querySelector('#seller-guest');
const profile = document.querySelector('#seller-profile');
const sellerHeader = document.querySelector('#seller-header');

function username(value) {
  const name = String(value ?? '').normalize('NFKC').trim();
  if (!/^[\p{L}\p{N} ._-]{3,24}$/u.test(name) || !/[\p{L}\p{N}]/u.test(name)) return '';
  const compact = name.toLowerCase().replace(/[ ._-]/g, '');
  return compact === 'sadoc777x' || compact === 'sadocstyle' ? '' : name;
}

function pickupDetails(data) {
  const pickup_city = String(data.get('pickup_city') || '').trim();
  const pickup_address = String(data.get('pickup_address') || '').trim();
  if (pickup_city.length < 2 || pickup_address.length < 5) {
    throw new Error('Escribe el municipio y la dirección completa de recogida.');
  }
  return { pickup_city, pickup_address };
}

function renderAccount(user) {
  guest.hidden = Boolean(user);
  profile.hidden = !user;
  const owner = Boolean(user && user.app_metadata?.sadoc_role === 'owner');
  const avatar = sellerHeader.querySelector('.seller-avatar');
  const label = sellerHeader.querySelector('strong');
  sellerHeader.querySelector('.owner-badge').hidden = !owner;

  if (!user) {
    label.textContent = 'Registrarse';
    const image = document.createElement('img');
    image.alt = '';
    image.src = 'assets/perfil-invitado.jpg';
    avatar.replaceChildren(image);
    return;
  }

  const profileName = username(user.user_metadata?.username);
  const name = owner ? 'Sadoc777x' : profileName || 'Mi cuenta';
  const source = user.user_metadata?.avatar;
  label.textContent = name;
  edit.elements.username.value = profileName;
  for (const field of ['pickup_city', 'pickup_address']) {
    if (edit.elements[field]) edit.elements[field].value = user.user_metadata?.[field] || '';
  }
  document.querySelector('#seller-welcome-title').textContent =
    `¡Te damos la bienvenida a SADOCSTYLE, ${name}!`;
  avatar.textContent = Array.from(name)[0].toUpperCase();
  if (typeof source === 'string' && source.length <= 6000 &&
      /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(source)) {
    const image = document.createElement('img');
    image.alt = '';
    image.src = source;
    avatar.replaceChildren(image);
  }
}

async function avatarThumbnail(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
    throw new Error('Elige una foto JPG, PNG o WebP de hasta 8 MB.');
  }
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 80;
    const context = canvas.getContext('2d');
    const side = Math.min(bitmap.width, bitmap.height);
    context.fillStyle = 'white';
    context.fillRect(0, 0, 80, 80);
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 80, 80);
    const image = canvas.toDataURL('image/jpeg', 0.72);
    if (!image.startsWith('data:image/jpeg;') || image.length > 6000) {
      throw new Error('No se pudo guardar esta foto. Prueba con otra.');
    }
    return image;
  } finally {
    bitmap.close();
  }
}

function authMessage(error) {
  if (error.code === 'invalid_credentials') return 'Revisa tu correo y contraseña.';
  if (error.code === 'email_not_confirmed') return 'Confirma tu correo antes de entrar.';
  if (error.code === 'email_address_not_authorized') return 'Este correo todavía no está habilitado para recibir confirmaciones.';
  if (error.code === 'over_email_send_rate_limit' || error.status === 429) return 'Espera un momento antes de volver a intentarlo.';
  if (error.code === 'weak_password') return 'Elige una contraseña más fuerte.';
  if (error.name === 'AuthRetryableFetchError') return 'No se pudo conectar. Inténtalo otra vez.';
  return error.name === 'Error' ? error.message : 'No se pudo completar la solicitud. Inténtalo otra vez.';
}

function handle(form, action) {
  const button = form.querySelector('button[type="submit"], button:not([type])');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    message.textContent = 'Un momento…';
    try {
      message.textContent = await action(new FormData(form));
    } catch (error) {
      message.textContent = authMessage(error);
    } finally {
      if (form.elements.password) form.elements.password.value = '';
      button.disabled = false;
    }
  });
  button.disabled = false;
}

try {
  const { client } = await import('./shop-client.js');
  handle(login, async data => {
    const { error } = await client.auth.signInWithPassword({
      email: data.get('email').trim(),
      password: data.get('password')
    });
    if (error) throw error;
    return 'Sesión iniciada.';
  });

  handle(signup, async data => {
    const name = username(data.get('username'));
    if (!name) throw new Error('Elige un nombre válido de 3 a 24 caracteres.');
    const metadata = { username: name, ...pickupDetails(data) };
    const photo = data.get('photo');
    if (photo.size) metadata.avatar = await avatarThumbnail(photo);
    const { error } = await client.auth.signUp({
      email: data.get('email').trim(),
      password: data.get('password'),
      options: { data: metadata, emailRedirectTo: storeUrl }
    });
    if (error) throw error;
    signup.reset();
    return 'Si el correo puede registrarse, recibirás un enlace para confirmar tu cuenta.';
  });

  handle(edit, async data => {
    const name = username(data.get('username'));
    if (!name) throw new Error('Elige un nombre válido de 3 a 24 caracteres.');
    const photo = data.get('photo');
    const metadata = { username: name, ...pickupDetails(data) };
    if (photo.size) metadata.avatar = await avatarThumbnail(photo);
    const { data: result, error } = await client.auth.updateUser({ data: metadata });
    if (error) throw error;
    edit.elements.photo.value = '';
    renderAccount(result.user);
    return 'Perfil guardado.';
  });

  signout.addEventListener('click', async () => {
    signout.disabled = true;
    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      message.textContent = 'Sesión cerrada.';
    } catch (error) {
      message.textContent = authMessage(error);
    } finally {
      signout.disabled = false;
    }
  });
  signout.disabled = false;

  const refreshClothing = connectClothingReview(client);
  client.auth.onAuthStateChange((event, session) => {
    if (['INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT'].includes(event)) {
      setTimeout(() => refreshClothing(session?.user).catch(console.error), 0);
    }
    renderAccount(session?.user);
    if (event === 'INITIAL_SESSION') message.textContent = '';
  });
} catch {
  message.textContent = 'El acceso a las cuentas no está disponible en este momento. Recarga la página para intentarlo otra vez.';
}
