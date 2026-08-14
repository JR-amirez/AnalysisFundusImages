import {
    getJobStore,
    isValidJobId,
    stateKey
} from '../../lib/retinal-jobs.mjs';

function json(statusCode, payload, extraHeaders = {}) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            ...extraHeaders
        },
        body: JSON.stringify(payload)
    };
}

export async function handler(event) {
    if (event.httpMethod !== 'GET') {
        return json(405, { detail: 'Metodo no permitido.' }, { 'Allow': 'GET' });
    }

    const jobId = event.queryStringParameters?.job_id;
    if (!isValidJobId(jobId)) {
        return json(400, { detail: 'Identificador de analisis invalido.' });
    }

    const store = getJobStore();
    const state = await store.get(stateKey(jobId), {
        consistency: 'strong',
        type: 'json'
    });

    if (!state) {
        return json(404, { detail: 'No se encontro el analisis solicitado.' });
    }

    return json(200, state);
}
