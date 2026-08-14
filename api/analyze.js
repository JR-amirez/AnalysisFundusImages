const DEFAULT_RUNPOD_BASE_URL = 'https://z5gcw5yq25fs4k.api.runpod.ai';
const RUNPOD_PATH = '/pipeline/sequential';
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
export const UPSTREAM_TIMEOUT_MS = 290_000;

export const config = {
    api: {
        bodyParser: false
    }
};

export const maxDuration = 300;

function json(res, statusCode, payload) {
    res.status(statusCode);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
}

function normalizeBaseUrl(value) {
    return (value || DEFAULT_RUNPOD_BASE_URL).replace(/\/+$/, '');
}

export function forwardToRunpod({ requestBody, contentType, apiKey, baseUrl, signal }) {
    return fetch(`${normalizeBaseUrl(baseUrl)}${RUNPOD_PATH}`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': contentType
        },
        body: requestBody,
        signal
    });
}

async function readRequestBody(req) {
    const chunks = [];
    let totalBytes = 0;

    for await (const chunk of req) {
        totalBytes += chunk.length;
        if (totalBytes > MAX_UPLOAD_BYTES) {
            const error = new Error('La imagen supera el limite de 30 MB.');
            error.statusCode = 413;
            throw error;
        }
        chunks.push(chunk);
    }

    return Buffer.concat(chunks);
}

export default async function handler(req, res) {
    if (req.method === 'GET') {
        return json(res, 200, { status: 'ok' });
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST');
        return json(res, 405, { detail: 'Metodo no permitido.' });
    }

    const apiKey = process.env.RUNPOD_API_KEY;
    if (!apiKey) {
        return json(res, 503, { detail: 'RUNPOD_API_KEY no esta configurada en el servidor.' });
    }

    const contentType = req.headers['content-type'] || '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
        return json(res, 415, { detail: 'Debes enviar la imagen como multipart/form-data.' });
    }

    const contentLength = Number(req.headers['content-length'] || 0);
    if (contentLength > MAX_UPLOAD_BYTES) {
        return json(res, 413, { detail: 'La imagen supera el limite de 30 MB.' });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
        const requestBody = await readRequestBody(req);
        const upstream = await forwardToRunpod({
            requestBody,
            contentType,
            apiKey,
            baseUrl: process.env.RUNPOD_BASE_URL,
            signal: controller.signal
        });

        const responseBody = Buffer.from(await upstream.arrayBuffer());
        const responseType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';

        res.status(upstream.status);
        res.setHeader('Content-Type', responseType);
        res.setHeader('Cache-Control', 'no-store');
        return res.end(responseBody);
    } catch (error) {
        if (error?.name === 'AbortError') {
            return json(res, 504, { detail: 'RunPod tardo demasiado en responder. Intenta nuevamente.' });
        }

        const statusCode = error?.statusCode || 502;
        console.error('Error al comunicarse con RunPod:', error?.message || error);
        return json(res, statusCode, { detail: error?.message || 'No fue posible comunicarse con RunPod.' });
    } finally {
        clearTimeout(timeoutId);
    }
}
