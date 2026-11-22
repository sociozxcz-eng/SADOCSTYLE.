const form = document.querySelector('#shop-assistant');
const input = form.elements.question;
const log = document.querySelector('#shop-log');
const statusLine = document.querySelector('#shop-answer');
const submit = form.querySelector('button[type=submit]');
const cancel = document.querySelector('#chat-cancel');
let watchdog;
function armTimer() {
  clearTimeout(watchdog);
  watchdog = setTimeout(() => fail('La IA tardó demasiado. Puedes reintentar el mensaje.'), 90000);
}
const greeting = '¡Hola! Soy el asistente virtual de SADOCSTYLE. ¿En qué te puedo ayudar?';
const instructions = 'Eres el asistente de SADOCSTYLE. Conversa en español colombiano, con naturalidad y brevedad. Responde al último mensaje teniendo en cuenta los anteriores. Datos de la tienda: solo prendas de vestir; comisión 10 % normal y 5 % tras una compra confirmada; caja de 10 velas en la primera compra confirmada; contraentrega pendiente de activación. Para registro: Cuenta de vendedor. No tienes acceso a pedidos, cuentas ni fotos. No afirmes que aprobaste productos, realizaste operaciones o verificaste un pago. Si desconoces algo, explica qué información falta. Atiende aquí en el chat. Nunca pidas claves, datos bancarios ni documentos.';
let saved;
try { saved = JSON.parse(sessionStorage.getItem('sadoc-support-v1')); } catch {}
const state = saved || { count: 0, history: [], key: crypto.randomUUID() };
const history = state.history;
function persist() { sessionStorage.setItem('sadoc-support-v1', JSON.stringify(state)); }
async function rpc(name, params) {
  const { client } = await import('./shop-client.js');
  const { data, error } = await client.rpc('sadoc_chat_' + name, params);
  if (error) throw error;
  return data;
}
const waiting = 'Ya envié tu conversación a soporte. Espera aquí mientras llega un asistente.';
let rendered = 0;
async function refreshCustomer() {
  const data = await rpc('read', { chat: state.chat, k: state.key });
  if (!data) throw new Error();
  for (const m of data.messages.slice(rendered)) {
    bubble(m.staff ? 'assistant' : 'user', m.staff ? 'Soporte: ' + m.body : m.body);
    rendered++;
  }
}
async function openChat() {
  const { client } = await import('./shop-client.js');
  const transcript = history.map(m => (m.role === 'user' ? 'Cliente: ' : 'IA: ') + m.content).join('\n').slice(-24000);
  const { data, error } = await client.rpc('sadoc_open_chat', { k: state.key, transcript_text: transcript });
  if (error) throw error;
  state.chat = data;
  persist();
  bubble('assistant', waiting);
  finish('');
}
async function handoff() {
  submit.disabled = true;
  try { await openChat(); }
  catch { finish('No se pudo entregar la conversación. Toca Reintentar conexión.');
    retry.hidden = false; }
}
const retry = document.createElement('button');
retry.textContent = 'Reintentar conexión';
retry.type = 'button'; retry.className = 'outline'; retry.hidden = true;
form.append(retry);
retry.onclick = () => { retry.hidden = true; handoff(); };
let worker;
function bubble(role, text) {
  const bubble = document.createElement('p');
  bubble.className = 'chat-' + role;
  bubble.textContent = text;
  bubble.setAttribute('aria-label', (role === 'assistant' ? 'Asistente: ' : 'Tú: ') + text);
  log.append(bubble);
  log.scrollTop = log.scrollHeight;
  return bubble;
}
function finish(message) {
  persist();
  clearTimeout(watchdog);
  cancel.hidden = true;
  statusLine.textContent = message;
  submit.disabled = false;
  input.focus();
}
function fail(message) {
  worker?.terminate();
  worker = null;
  if (history.at(-1)?.role === 'user') {
    input.value = history.pop().content;
    if (log.lastElementChild?.className === 'chat-user') log.lastElementChild.remove();
  }
  finish(typeof message === 'string' ? message : 'La IA no pudo iniciar en este dispositivo. Puedes reintentar el envío de tu mensaje.');
}
cancel.onclick = () => fail('Mensaje cancelado. Puedes editarlo y volver a enviarlo.');
bubble('assistant', greeting);
for (const m of history) bubble(m.role, m.content);
if (state.chat) {
  bubble('assistant', waiting);
  refreshCustomer().catch(() => { statusLine.textContent = 'Intentando reconectar…'; });
} else if (state.count >= 10) handoff();
setInterval(() => {
  if (state.chat && !document.hidden && form.offsetWidth) refreshCustomer().catch(() => {});
}, 3500);
form.addEventListener('submit', async event => {
  event.preventDefault();
  const question = input.value.trim();
  if (!question || submit.disabled) return;
  if (state.chat) {
    submit.disabled = true;
    if (state.pending?.body !== question) state.pending = { id: crypto.randomUUID(), body: question };
    persist();
    try {
      await rpc('send', { chat: state.chat, k: state.key, request: state.pending.id, body_text: question });
      state.pending = null; input.value = ''; persist(); await refreshCustomer(); finish('');
    } catch { finish('No se pudo actualizar el chat. Revisa tu conexión.'); }
    return;
  }
  if (state.count >= 10) return handoff();
  state.count++;
  input.value = '';
  bubble('user', question);
  history.push({ role: 'user', content: question });
  persist();
  if (state.count >= 10) return handoff();
  if (/^(hola+(?: mano| bro)?|holi|buenas(?: tardes| noches)?|buenos d[ií]as)[!.¡¿? ]*$/iu.test(question.replace(/^¡/, ''))) {
    const reply = '¡Hola! Cuéntame, ¿quieres comprar, publicar una prenda o necesitas ayuda con tu cuenta?';
    history.push({ role: 'assistant', content: reply });
    bubble('assistant', reply);
    finish('');
    return;
  }
  submit.disabled = true;
  cancel.hidden = false;
  armTimer();
  statusLine.textContent = worker ? 'Pensando…' : 'Cargando la IA en tu dispositivo…';
  try {
    if (!worker) {
      worker = new Worker('support-worker.js?v=2', { type: 'module' });
      worker.onerror = fail;
      worker.onmessage = ({ data }) => {
        armTimer();
        if (data.error) return fail();
        if (data.reply) {
          history.push({ role: 'assistant', content: data.reply });
          bubble('assistant', data.reply);
          finish('');
        } else if (data.thinking) statusLine.textContent = 'Escribiendo…';
        else if (Number.isFinite(data.progress)) statusLine.textContent = data.progress >= 100 ? 'Descarga completa. Preparando la IA en tu dispositivo…' : 'Descargando IA: ' + data.progress + ' %';
      };
    }
    worker.postMessage([{ role: 'system', content: instructions }, ...history.slice(-7)]);
  } catch { fail(); }
});

async function setupInbox() {
  const { client } = await import('./shop-client.js');
  const panel = document.querySelector('#staff-panel');
  const select = document.querySelector('#staff-chats');
  const thread = document.querySelector('#staff-history');
  const reply = document.querySelector('#staff-form');
  const status = document.querySelector('#staff-status');
  let owner = null, pending, version = 0;
  async function render() {
    const current = ++version;
    if (!owner) return;
    try {
      const chats = await rpc('inbox', {});
      if (current !== version) return;
      const selected = select.value;
      select.replaceChildren(new Option('Selecciona una conversación', ''));
      for (const item of chats) select.add(new Option('Chat ' + item.chat.slice(0,8) + ' · ' + new Date(item.updated_at).toLocaleString('es-CO'),item.chat));
      select.value = selected;
      status.textContent = chats.length ? chats.length + ' conversaciones en soporte' : 'Todavía no hay solicitudes.';
      for (const link of document.querySelectorAll('a[href="#soporte"]')) link.textContent = chats.length ? 'Ayuda y reportes (' + chats.length + ')' : 'Ayuda y reportes';
      reply.hidden = !selected;
      if (!selected) { thread.textContent = ''; return; }
      const data = await rpc('read', { chat: selected, k: null });
      if (current !== version || select.value !== selected) return;
      thread.textContent = [data.transcript, ...data.messages.map(m => (m.staff ? 'Soporte: ' : 'Cliente: ') + m.body)].join('\n');
    } catch { if (current === version) status.textContent = 'No se pudo actualizar la bandeja.'; }
  }
  select.onchange = () => { thread.textContent = ''; reply.elements.reply.value = ''; render(); };
  reply.onsubmit = async event => {
    event.preventDefault();
    const body = reply.elements.reply.value.trim(), chat = select.value;
    if (!body || !chat || !owner) return;
    if (pending?.body !== body || pending?.chat !== chat) pending = {body,chat,id:crypto.randomUUID()};
    const button = reply.querySelector('button'); button.disabled = true;
    try {
      await rpc('send',{chat,k:null,request:pending.id,body_text:body});
      if (select.value === chat) reply.elements.reply.value = '';
      pending = null; await render();
    } catch { status.textContent = 'No se pudo enviar la respuesta. Inténtalo de nuevo.'; }
    finally { button.disabled = false; }
  };
  let authVersion = 0;
  client.auth.onAuthStateChange((_event, session) => {
    const stamp = ++authVersion;
    setTimeout(async () => {
    const agent = session?.user ? await rpc('agent', {}).catch(() => false) : false;
    if (stamp !== authVersion) return;
    owner = agent;
    panel.hidden = !owner;
    if (owner) setTimeout(render,0);
    else { version++; select.length = 1; thread.textContent = ''; reply.reset(); reply.hidden = true; status.textContent = ''; }
    }, 0);
  });
  setInterval(() => { if (owner && !document.hidden) render(); }, 5000);
}
setupInbox().catch(() => {});
