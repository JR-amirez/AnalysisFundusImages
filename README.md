# AnalysisFundusImages

Formulario web para enviar una imagen de fondo de ojo al pipeline retinal alojado en RunPod.

## Configuracion segura

El navegador llama a `/api/analyze`. Esa funcion agrega la autenticacion de RunPod en el servidor para evitar publicar la API key en `index.html`.

Variables requeridas:

```text
RUNPOD_API_KEY=rpa_...
RUNPOD_BASE_URL=https://z5gcw5yq25fs4k.api.runpod.ai
```

`RUNPOD_BASE_URL` es opcional y ya tiene configurado el endpoint actual. `RUNPOD_API_KEY` debe guardarse como secreto del entorno de despliegue y nunca confirmarse en Git.

## Despliegue en Netlify

El repositorio incluye `netlify/functions/analyze.mjs` y la ruta `/api/analyze` configurada en `netlify.toml`.

1. Abre el sitio en Netlify.
2. Configura `RUNPOD_API_KEY` en **Site configuration > Environment variables**.
3. Vuelve a desplegar el sitio.

Para desarrollo local con Netlify CLI:

```bash
npx netlify dev
```

También se conserva una función compatible con Vercel en `api/analyze.js`. En ambos casos, la función acepta `multipart/form-data`, limita las cargas a 30 MB y reenvía la respuesta de `/pipeline/sequential` sin exponer la credencial al navegador.
