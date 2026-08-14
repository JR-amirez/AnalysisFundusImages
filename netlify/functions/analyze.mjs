import { randomUUID } from 'node:crypto';

import {
    getJobStore,
    isValidJobId,
    requestKey,
    stateKey,
    writeJobState
} from '../../lib/retinal-jobs.mjs';
import { MAX_UPLOAD_BYTES } from '../../api/analyze.js';

function json(statusCode, payload, extraHeaders = {}) {
    return Response.json(payload, {
        status: statusCode,
        headers: {
            'Cache-Control': 'no-store',
            ...extraHeaders
        }
    });
}

export default async function handler(request) {
    if (request.method === 'GET') {
        return json(200, { status: 'ok', mode: 'background' });
    }

    if (request.method !== 'POST') {
        return json(405, { detail: 'Metodo no permitido.' }, { 'Allow': 'GET, POST' });
    }

    if (!process.env.RUNPOD_API_KEY) {
        return json(503, { detail: 'RUNPOD_API_KEY no esta configurada en el servidor.' });
    }

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
        return json(415, { detail: 'Debes enviar la imagen como multipart/form-data.' });
    }

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_UPLOAD_BYTES) {
        return json(413, { detail: 'La imagen supera el limite de 30 MB.' });
    }

    const requestBody = Buffer.from(await request.arrayBuffer());

    if (requestBody.length > MAX_UPLOAD_BYTES) {
        return json(413, { detail: 'La imagen supera el limite de 30 MB.' });
    }

    const jobId = randomUUID();
    if (!isValidJobId(jobId)) {
        return json(500, { detail: 'No fue posible crear el identificador del analisis.' });
    }

    const store = getJobStore();
    try {
        await store.set(requestKey(jobId), requestBody, {
            metadata: { contentType }
        });
        await writeJobState(store, jobId, {
            status: 'queued',
            created_at: new Date().toISOString()
        });

        const backgroundResponse = await fetch(
            `${new URL(request.url).origin}/.netlify/functions/analyze-background`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ job_id: jobId })
            }
        );

        if (backgroundResponse.status !== 202) {
            throw new Error(`La funcion en segundo plano respondio HTTP ${backgroundResponse.status}.`);
        }

        return json(202, {
            job_id: jobId,
            status: 'queued'
        });
    } catch (error) {
        await Promise.allSettled([
            store.delete(requestKey(jobId)),
            store.delete(stateKey(jobId))
        ]);
        console.error('No fue posible iniciar el analisis:', error?.message || error);
        return json(502, { detail: 'No fue posible iniciar el analisis.' });
    }
}
