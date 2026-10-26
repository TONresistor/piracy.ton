import { API_URL } from '../services/api.js';
import { createBagDetailView } from '../components/bag-detail.js';
import { t } from '../i18n/index.js';
export function createBagDetailController({ doc = document, browser = window, fetcher = fetch, translate = t, view = createBagDetailView(doc, translate) } = {}) {
    const document = doc, window = browser;
    async function loadBagDetail() {
        view.reset();
        const params = new URLSearchParams(window.location.search);
        const bagId = params.get('id');
        if (!bagId) {
            view.showNotFound();
            return;
        }
        try {
            const publication = params.get('publication');
            const dbRes = await fetcher(publication ? `${API_URL}/v3/publications/${encodeURIComponent(publication)}` : `${API_URL}/bags/${encodeURIComponent(bagId)}`);
            if (dbRes.status === 404) {
                view.showNotFound();
                return;
            }
            if (!dbRes.ok)
                throw new Error('HTTP ' + dbRes.status);
            const dbData = await dbRes.json();
            let storageData = null;
            try {
                const storageRes = await fetcher(`${API_URL}/bag-info/${encodeURIComponent(dbData.bag_id)}`);
                if (storageRes.ok)
                    storageData = await storageRes.json();
            }
            catch { /* Publication details remain available without storage metadata. */ }
            view.renderBag(dbData, storageData);
        }
        catch (err) {
            console.error('Error loading bag:', err);
            view.showNotFound(true);
        }
    }
    document.getElementById('retry-bag').addEventListener('click', loadBagDetail);
    loadBagDetail();
    return { loadBagDetail };
}
