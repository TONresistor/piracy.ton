import { V3Error } from './v3/errors.js';

export const recurringPolicy = [
    { kind: 'config', interval: 15000, priority: 100, maxStale: 60000, maxRun: 30000 },
    { kind: 'index-v3', interval: 60000, priority: 8, maxStale: 300000, maxRun: 180000 },
    { kind: 'index-v2', interval: 60000, priority: 7, maxStale: 600000, maxRun: 300000 },
    { kind: 'deletions-v2', interval: 300000, priority: 4, maxStale: 900000, maxRun: 300000 },
    { kind: 'legacy-attempts', interval: 5000, priority: 9, maxStale: 180000, maxRun: 120000 },
    { kind: 'metadata', interval: 60000, priority: 6, maxStale: 180000, maxRun: 30000 },
    { kind: 'backup', interval: 86400000, priority: 5, maxStale: 93600000, maxRun: 600000 }
];
export function classifyJobError(error) {
    if (error instanceof V3Error && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) {
        return { terminal: true, code: error.code, status: error.status };
    }
    return { terminal: false, code: 'dependency_unavailable', status: 503 };
}
