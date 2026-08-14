import {
    getJobStore,
    isValidJobId,
    stateKey
} from '../../lib/retinal-jobs.mjs';

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
    if (request.method !== 'GET') {
        return json(405, { detail: 'Metodo no permitido.' }, { 'Allow': 'GET' });
    }

    const jobId = new URL(request.url).searchParams.get('job_id');
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
