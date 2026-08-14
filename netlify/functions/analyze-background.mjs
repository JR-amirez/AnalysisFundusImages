import {
    forwardToRunpod,
    UPSTREAM_TIMEOUT_MS
} from '../../api/analyze.js';
import {
    getJobStore,
    isValidJobId,
    requestKey,
    writeJobState
} from '../../lib/retinal-jobs.mjs';

function safeDetail(payload, fallback) {
    if (payload && typeof payload.detail === 'string') {
        return payload.detail;
    }
    return fallback;
}

export async function handler(event) {
    const store = getJobStore();
    let jobId;

    try {
        const payload = JSON.parse(event.body || '{}');
        jobId = payload.job_id;
        if (!isValidJobId(jobId)) {
            throw new Error('Identificador de analisis invalido.');
        }

        const requestEntry = await store.getWithMetadata(requestKey(jobId), {
            consistency: 'strong',
            type: 'arrayBuffer'
        });
        if (!requestEntry?.data) {
            throw new Error('La imagen temporal del analisis no esta disponible.');
        }

        const apiKey = process.env.RUNPOD_API_KEY;
        if (!apiKey) {
            throw new Error('RUNPOD_API_KEY no esta configurada en el servidor.');
        }

        await writeJobState(store, jobId, {
            status: 'processing',
            started_at: new Date().toISOString()
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
        let upstream;
        try {
            upstream = await forwardToRunpod({
                requestBody: Buffer.from(requestEntry.data),
                contentType: requestEntry.metadata?.contentType || 'application/octet-stream',
                apiKey,
                baseUrl: process.env.RUNPOD_BASE_URL,
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeoutId);
        }

        const responseText = await upstream.text();
        let responsePayload;
        try {
            responsePayload = JSON.parse(responseText);
        } catch {
            responsePayload = { detail: responseText || `RunPod respondio HTTP ${upstream.status}.` };
        }

        if (!upstream.ok) {
            throw new Error(safeDetail(responsePayload, `RunPod respondio HTTP ${upstream.status}.`));
        }

        await writeJobState(store, jobId, {
            status: 'completed',
            completed_at: new Date().toISOString(),
            result: responsePayload
        });
    } catch (error) {
        console.error(`Analisis ${jobId || 'desconocido'} fallido:`, error?.message || error);
        if (isValidJobId(jobId)) {
            await writeJobState(store, jobId, {
                status: 'failed',
                completed_at: new Date().toISOString(),
                detail: error?.name === 'AbortError'
                    ? 'RunPod tardo demasiado en responder.'
                    : (error?.message || 'El analisis no pudo completarse.')
            });
        }
    } finally {
        if (isValidJobId(jobId)) {
            await store.delete(requestKey(jobId)).catch(() => {});
        }
    }
}

export const config = {
    background: true
};
