export const API_URL = '/api';
export function createApi(fetcher = fetch) {
    return async (path, body) => {
        const response = await fetcher(API_URL + '/' + path, { cache: 'no-store', signal: AbortSignal.timeout(15000), ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
        const data = await response.json();
        if (!response.ok)
            throw new Error(data.code || 'chain_unavailable');
        return data;
    };
}
export const request = createApi();
