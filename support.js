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
const instructions = 'Eres el asistente de SADOCSTYLE. Conversa en español colombiano, con naturalidad y brevedad. Responde al último mensaje teniendo en cuenta los anteriores. Datos de la tienda: solo prendas de vestir; comisión 10 % normal y 5 % tras una compra confirmada; caja de 10 velas en la primera compra confirmada; contraentrega pendiente de activación. Para registro: Cuenta de vendedor. No tienes acceso a pedidos, cuentas ni fotos. No afirmes que aprobaste productos, realizaste operaciones o verificaste un pago. Si desconoces algo, explica qué información falta. Ayuda a describir los reportes de publicaciones y explica cómo enviarlos en este chat. Nunca pidas claves, datos bancarios ni documentos.';
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
const waiting = 'Gracias por avisarnos. Recibimos tu petición y revisaremos lo que pasó. Te responderemos por este chat. Atentamente, el equipo de SADOCSTYLE.';
const requestButton = document.querySelector('#leave-request');
requestButton.hidden = Boolean(state.chat);
requestButton.onclick = () => {
  if (state.chat || requestButton.disabled) return;
  if (worker && submit.disabled) fail('Puedes dejar tu petición.');
  state.collecting = true;
  persist();
  statusLine.textContent = 'Cuéntame qué pasó y toca Enviar.';
  input.focus();
};
const draft = document.querySelector('#report-draft');
const reportButton = document.querySelector('#sadoc-report-link');
const reportName = document.querySelector('#report-name');
const reportReason = document.querySelector('#report-reason');
const reportStatus = document.querySelector('#report-status');
const reportSend = document.querySelector('#report-send');
const reportClose = document.querySelector('#report-close');
function beginReport(listing) {
  if (submit.disabled) return;
  state.report = listing ? {name:listing.name, id:listing.id} : state.report || {};
  reportName.value = state.report.name || '';
  reportReason.value = state.report.reason || '';
  draft.hidden = false;
  reportButton.setAttribute('aria-expanded','true');
  reportStatus.textContent = '';
  persist();
  (reportName.value ? reportReason : reportName).focus();
}
function closeReport() {
  draft.hidden = true;
  reportButton.setAttribute('aria-expanded','false');
  delete state.report; persist(); reportButton.focus();
}
reportButton.onclick = () => beginReport();
reportClose.onclick = closeReport;
window.addEventListener('sadoc-report',event=>beginReport(event.detail));
draft.oninput = () => {
  if (state.report.name !== reportName.value) delete state.report.id;
  Object.assign(state.report,{name:reportName.value,reason:reportReason.value});
  persist();
};
draft.onkeydown = event => {
  if (event.key === 'Enter' && event.target === reportName) {event.preventDefault(); reportReason.focus();}
};
reportSend.onclick = async () => {
  if (submit.disabled || reportSend.disabled) return;
  const name = reportName.value.trim(), reason = reportReason.value.trim();
  const greetingOnly = /^(?:hola+|buenas(?: tardes| noches)?|hey|holi|buenos días)[\s!.¡¿?]*$/iu;
  if (name.length < 2 || greetingOnly.test(name)) {
    reportStatus.textContent = 'Escribe el nombre de la prenda que quieres reportar.'; reportName.focus(); return;
  }
  if (reason.length < 5 || greetingOnly.test(reason)) {
    reportStatus.textContent = 'Cuenta qué pasó con la publicación para que podamos revisarla.'; reportReason.focus(); return;
  }
  const body = 'Reporte de publicación · ' + name + (state.report.id ? ' (' + state.report.id + ')' : '') + ': ' + reason;
  const ack = 'Recibimos tu reporte sobre «' + name + '». Puedes consultar la respuesta en este chat.';
  draft.disabled = true; submit.disabled = true; requestButton.disabled = true;
  reportStatus.textContent = 'Enviando reporte…';
  try {
    if (state.chat) {
      if (state.report.pending?.body !== body) state.report.pending = {body,id:crypto.randomUUID()};
      persist();
      await rpc('send',{chat:state.chat,k:state.key,request:state.report.pending.id,body_text:body});
      await refreshCustomer().catch(()=>{});
    } else {
      const {client} = await import('./shop-client.js');
      const transcript = [...history,{role:'user',content:body}].map(m=>(m.role==='user'?'Cliente: ':'IA: ')+m.content).join('\n').slice(-24000);
      const {data,error} = await client.rpc('sadoc_open_chat',{k:state.key,transcript_text:transcript});
      if(error || !data) throw error || Error();
      state.chat=data; state.collecting=false; requestButton.hidden=true;
      history.push({role:'user',content:body}); bubble('user',body);
    }
    closeReport(); bubble('assistant',ack); statusLine.textContent='';
  } catch {reportStatus.textContent='El envío no se pudo confirmar. Conservamos tu reporte para que puedas reintentar.';}
  finally {draft.disabled=false;submit.disabled=false;requestButton.disabled=false;}
};
if (state.report) beginReport();
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
  state.chat = data; delete state.report;
  state.collecting = false;
  requestButton.hidden = true;
  persist();
  bubble('assistant', waiting);
  finish('');
}
async function handoff() {
  submit.disabled = true;
  requestButton.disabled = true;
  retry.hidden = true;
  statusLine.textContent = 'Un momento, estamos guardando tu petición…';
  try { await openChat(); }
  catch { finish('No se pudo entregar la conversación. Toca Reintentar conexión.');
    retry.hidden = false; }
  finally { requestButton.disabled = false; }
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
}
setInterval(() => {
  if (state.chat && !document.hidden && form.offsetWidth) refreshCustomer().catch(() => {});
}, 3500);
form.addEventListener('submit', async event => {
  event.preventDefault();
  let question = input.value.trim();
  if (!question || submit.disabled) return;
  if (!state.chat && /^(?:hola+|buenas|hey|holi)[\s!.¡¿?]*$/iu.test(question)) {
    input.value='';
    const answer='¡Hola! ¿En qué te puedo ayudar?';
    history.push({role:'user',content:question},{role:'assistant',content:answer});
    bubble('user',question); bubble('assistant',answer); finish(''); return;
  }
  if (/^(?:quiero |necesito )?reportar\b/iu.test(question)) {
    input.value=''; beginReport(); return;
  }
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

  input.value = '';
  bubble('user', question);
  history.push({ role: 'user', content: question });
  persist();
  if (!state.report && (state.collecting || /\b(falla\w*|error(?:es)?|problema\w*|reclamo|queja|petici[oó]n|reportar|no (?:me )?(?:funciona|carga|deja|llega)|hablar con (?:una persona|soporte))\b/iu.test(question))) {
    state.collecting = true;
    persist();
    return handoff();
  }
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
  const list = document.querySelector('#staff-chats');
  let selected = '', signature = '';
  const previews = new Map();
  const day = new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',dateStyle:'long'});
  const hour = new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',timeStyle:'short'});
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
      if (!chats.some(item=>item.chat===selected)) selected = chats[0]?.chat || '';
      const opened = selected;
      const today = day.format(Date.now()), yesterday = day.format(Date.now()-86400000);
      const key = JSON.stringify([today,selected,chats,Array.from(previews)]);
      if (key !== signature) {
        signature = key;
        const fragment = document.createDocumentFragment();
        let lastDay;
        for (const item of chats) {
          const date = new Date(item.updated_at), group = day.format(date);
          if (group !== lastDay) {
            const heading = document.createElement('h4');
            heading.textContent = group===today ? 'Hoy' : group===yesterday ? 'Ayer' : group;
            fragment.append(heading); lastDay=group;
          }
          const button = document.createElement('button'), title = document.createElement('span'), time = document.createElement('time');
          button.type='button'; button.setAttribute('aria-pressed',String(item.chat===selected));
          title.textContent = previews.get(item.chat) || 'Chat de soporte';
          time.dateTime=item.updated_at; time.textContent=hour.format(date);
          button.append(title,time);
          button.onclick=()=>{if(selected===item.chat)return; selected=item.chat;thread.textContent='';reply.elements.reply.value='';render();};
          fragment.append(button);
        }
        list.replaceChildren(fragment);
      }
      status.textContent = chats.length ? chats.length + ' conversaciones en soporte' : 'Todavía no hay solicitudes.';
      for (const link of document.querySelectorAll('a[href="#soporte"]')) link.textContent = chats.length ? 'Ayuda y reportes (' + chats.length + ')' : 'Ayuda y reportes';
      reply.hidden = !selected;
      if (!selected) { thread.textContent = ''; return; }
      const data = await rpc('read', { chat: selected, k: null });
      if (current !== version || opened !== selected) return;
      const preview = data.transcript?.split('\n').filter(line=>line.startsWith('Cliente: ')).at(-1)?.slice(8) || data.messages.at(-1)?.body;
      if(preview) {previews.set(selected,preview);const title=list.querySelector('[aria-pressed=true] span');if(title)title.textContent=preview;}
      thread.textContent = [data.transcript, ...data.messages.map(m => (m.staff ? 'Soporte: ' : 'Cliente: ') + m.body)].join('\n');
    } catch { if (current === version) status.textContent = 'No se pudo actualizar la bandeja.'; }
  }
  reply.onsubmit = async event => {
    event.preventDefault();
    const body = reply.elements.reply.value.trim(), chat = selected;
    if (!body || !chat || !owner) return;
    if (pending?.body !== body || pending?.chat !== chat) pending = {body,chat,id:crypto.randomUUID()};
    const button = reply.querySelector('button'); button.disabled = true;
    try {
      await rpc('send',{chat,k:null,request:pending.id,body_text:body});
      if (selected === chat) reply.elements.reply.value = '';
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
    else { version++; selected=''; signature=''; previews.clear(); list.replaceChildren(); thread.textContent = ''; reply.reset(); reply.hidden = true; status.textContent = ''; }
    }, 0);
  });
  setInterval(() => { if (owner && !document.hidden) render(); }, 5000);
}
setupInbox().catch(() => {});
