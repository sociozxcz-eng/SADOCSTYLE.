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
const history = [];
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
form.addEventListener('submit', event => {
  event.preventDefault();
  const question = input.value.trim();
  if (!question || submit.disabled) return;
  input.value = '';
  bubble('user', question);
  history.push({ role: 'user', content: question });
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
