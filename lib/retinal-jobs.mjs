import { getStore } from '@netlify/blobs';

const STORE_NAME = 'retinal-analysis-jobs';
const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getJobStore() {
    return getStore(STORE_NAME);
}

export function isValidJobId(jobId) {
    return typeof jobId === 'string' && JOB_ID_PATTERN.test(jobId);
}

export function requestKey(jobId) {
    return `requests/${jobId}`;
}

export function stateKey(jobId) {
    return `states/${jobId}.json`;
}

export async function writeJobState(store, jobId, state) {
    await store.setJSON(stateKey(jobId), state);
}
