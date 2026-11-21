# Activar la revisión de fotos

1. Ejecuta `supabase/ropa-en-revision.sql` en el proyecto de Supabase si la tabla todavía no existe. Conserva la revisión del dueño para anuncios dudosos.
2. Usa Cloudflare Workers Free. Desde esta carpeta configura los secretos con `npx wrangler secret put WEBHOOK_SECRET` (un valor aleatorio privado) y `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY` (clave de servidor del proyecto). Despliega con `npx wrangler deploy`. Mantén las claves fuera de GitHub y del navegador.
3. Revisa y acepta con tu cuenta la licencia del modelo de visión según https://developers.cloudflare.com/workers-ai/models/llama-3.2-11b-vision-instruct/ antes de usarlo.
4. En Database Webhooks de Supabase añade un webhook para INSERT en public.clothing_listings. Usa POST a la URL HTTPS del Worker, Content-Type application/json y Authorization con el valor Bearer seguido de un espacio y tu WEBHOOK_SECRET. Configura el tiempo de espera para la inferencia.
5. Haz una prueba con un anuncio de ropa, otro de un objeto distinto y una foto ambigua. Comprueba las decisiones en la tabla y en una sesión de visitante. Si se agota el cupo o falla la revisión, el anuncio sigue pendiente para el dueño. El webhook procesa nuevos anuncios.
