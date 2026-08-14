import {
    forwardToRunpod,
    MAX_UPLOAD_BYTES,
    UPSTREAM_TIMEOUT_MS
} from '../../api/analyze.js';

function json(statusCode, payload) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        },
        body: JSON.stringify(payload)
    };
}

export async function handler(event) {
    if (event.httpMethod === 'GET') {
        return json(200, { status: 'ok' });
    }

    if (event.httpMethod !== 'POST') {
        return {
            ...json(405, { detail: 'Metodo no permitido.' }),
            headers: {
                ...json(405, {}).headers,
                'Allow': 'GET, POST'
            }
        };
    }

    const apiKey = process.env.RUNPOD_API_KEY;
    if (!apiKey) {
        return json(503, { detail: 'RUNPOD_API_KEY no esta configurada en el servidor.' });
    }

    const contentType = event.headers?.['content-type'] || event.headers?.['Content-Type'] || '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
        return json(415, { detail: 'Debes enviar la imagen como multipart/form-data.' });
    }

    const requestBody = event.isBase64Encoded
        ? Buffer.from(event.body || '', 'base64')
        : Buffer.from(event.body || '', 'utf8');

    if (requestBody.length > MAX_UPLOAD_BYTES) {
        return json(413, { detail: 'La imagen supera el limite de 30 MB.' });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
        const upstream = await forwardToRunpod({
            requestBody,
            contentType,
            apiKey,
            baseUrl: process.env.RUNPOD_BASE_URL,
            signal: controller.signal
        });
        const responseBody = Buffer.from(await upstream.arrayBuffer());

        return {
            statusCode: upstream.status,
            headers: {
                'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
                'Cache-Control': 'no-store'
            },
            body: responseBody.toString('base64'),
            isBase64Encoded: true
        };
    } catch (error) {
        if (error?.name === 'AbortError') {
            return json(504, { detail: 'RunPod tardo demasiado en responder. Intenta nuevamente.' });
        }

        console.error('Error al comunicarse con RunPod:', error?.message || error);
        return json(502, { detail: 'No fue posible comunicarse con RunPod.' });
    } finally {
        clearTimeout(timeoutId);
    }
}
