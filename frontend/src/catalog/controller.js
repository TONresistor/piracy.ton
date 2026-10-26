import { API_URL } from '../services/api.js';
import { t } from '../i18n/index.js';
import { createCatalogTable } from '../components/catalog-table.js';
import { renderPagination as drawPagination } from '../components/catalog-pagination.js';
export function createCatalogController({ doc = document, browser = window, fetcher = fetch, translate = t, view = createCatalogTable(doc, browser, translate) } = {}) {
    const document = doc, window = browser;
    const setTableMessage = key => view.setTableMessage(key);
    const setTableSkeleton = () => view.setTableSkeleton();
    const renderBags = bags => view.renderBags(bags);
    let catalogRequest;
    let catalogRequestId = 0;
    const catalog = { query: '', category: '', page: 1, limit: 50, total: 0, loaded: false, loading: false, error: false };
    const renderPagination = () => drawPagination(catalog, doc, translate);
    async function loadBags(query = '', category = '', page = 1) {
        const requestId = ++catalogRequestId;
        catalogRequest?.abort();
        catalogRequest = new AbortController();
        Object.assign(catalog, { query, category, page, loading: true, error: false });
        const params = new URLSearchParams();
        params.set('version', 'all');
        params.set('page', page);
        params.set('limit', catalog.limit);
        if (query)
            params.set('q', query);
        if (category)
            params.set('category', category);
        setTableSkeleton();
        renderPagination();
        try {
            const response = await fetcher(`${API_URL}/bags?` + params.toString(), { signal: catalogRequest.signal });
            if (!response.ok)
                throw new Error('HTTP ' + response.status);
            const data = await response.json();
            if (requestId !== catalogRequestId)
                return;
            const lastPage = Math.max(1, Math.ceil(data.total / data.limit));
            if (page > lastPage)
                return await loadBags(query, category, lastPage);
            Object.assign(catalog, { total: data.total, limit: data.limit, page: data.page, loaded: true });
            renderBags(data.bags);
        }
        catch (err) {
            if (requestId !== catalogRequestId || err.name === 'AbortError')
                return;
            console.error('Failed to load bags:', err);
            catalog.error = true;
            setTableMessage('load_error');
        }
        finally {
            if (requestId === catalogRequestId) {
                catalog.loading = false;
                renderPagination();
            }
        }
    }
    document.getElementById('search-btn').addEventListener('click', () => {
        const query = document.getElementById('search').value;
        const category = document.querySelector('input[name="cat"]:checked').value;
        loadBags(query, category);
    });
    document.getElementById('search').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('search-btn').click();
        }
    });
    document.querySelectorAll('input[name="cat"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const query = document.getElementById('search').value;
            const category = document.querySelector('input[name="cat"]:checked').value;
            loadBags(query, category);
        });
    });
    document.getElementById('previous-page').addEventListener('click', () => {
        if (!catalog.loading && catalog.page > 1)
            loadBags(catalog.query, catalog.category, catalog.page - 1);
    });
    document.getElementById('next-page').addEventListener('click', () => {
        if (!catalog.loading && catalog.page * catalog.limit < catalog.total)
            loadBags(catalog.query, catalog.category, catalog.page + 1);
    });
    window.addEventListener('piracy:language-changed', renderPagination);
    loadBags();
    return { loadBags, state: catalog };
}
