// Retrieve the closest shop answer using TF-IDF over Spanish example questions.
const topics = [
  ['comisión comisiones porcentaje cuánto cobran por vender tarifa comisión reducida', 'La comisión es del 10 % por venta confirmada. Baja al 5 % si el vendedor ya hizo una compra confirmada en la tienda.'],
  ['registro registrarme cuenta contraseña correo iniciar sesión perfil entrar', 'Abre Cuenta de vendedor. Allí puedes crear tu cuenta con tu correo o iniciar sesión para acceder a tu perfil.'],
  ['qué ropa prendas publicar producto permitido aprobado aprobación revisión vender camiseta pantalón buzo objetos prohibidos foto', 'Se admiten prendas de vestir. La foto debe mostrar la prenda y coincidir con el anuncio. Un carro o una silla quedan fuera del catálogo de ropa.'],
  ['pendiente estado mi publicación anuncio revisado rechazado borrador aparece visible publicado', 'Un borrador solo se ve en tu navegador. Un anuncio enviado queda pendiente hasta su aprobación. Puedes consultar el estado en Publicar producto con tu sesión iniciada.'],
  ['envíos envío domicilio pagar pago contraentrega contra entrega activar transportadora nequi', 'La contraentrega automática está pendiente de activación. Puedes ver las opciones disponibles al finalizar la compra.'],
  ['regalo velas primera compra caja velitas', 'La caja de 10 velas navideñas corresponde a la primera compra confirmada.'],
  ['reportar denunciar fraude estafa publicación ofensiva ayuda humana persona asesor', 'Usa Reportar una publicación e indica el producto y el motivo. Para atención personal, toca Hablar con soporte.']
];
const stop = new Set('que como cuanto cuanto es mi una las los por para del con de en la el un se me al ya y a puedo'.split(' '));
function words(text) {
  return new Set(text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z0-9]+/).filter(w => w && !stop.has(w)));
}
const docs = topics.map(([question]) => words(question));
const weights = new Map();
for (const doc of docs) for (const word of doc) weights.set(word, (weights.get(word) || 0) + 1);
for (const [word, count] of weights) weights.set(word, 1 + Math.log(docs.length / count));
function answer(text) {
  const query = words(text);
  const scores = docs.map((doc, index) => {
    const total = [...doc].reduce((n, w) => n + weights.get(w) ** 2, 0);
    const match = [...query].reduce((n, w) => n + (doc.has(w) ? weights.get(w) ** 2 : 0), 0);
    return { index, score: match / Math.sqrt(total) };
  }).sort((a,b) => b.score - a.score);
  if (!scores[0].score || scores[0].score === scores[1].score)
    return '¿Tu pregunta es sobre publicar ropa, comisiones, pagos o tu cuenta? También puedes tocar Hablar con soporte.';
  return topics[scores[0].index][1];
}
const form = document.querySelector('#shop-assistant');
form.addEventListener('submit', event => {
  event.preventDefault();
  const question = form.elements.question.value.trim();
  if (question) document.getElementById('shop-answer').textContent = answer(question);
});
