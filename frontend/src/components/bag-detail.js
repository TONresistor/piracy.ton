import { formatSize, formatDate, escapeHtml } from '../format.js';
import { bindCopy } from '../clipboard.js';
import { t, applyTranslations } from '../i18n/index.js';
export function createBagDetailView(document, translate = t) {
    const t = translate;
    const CATEGORY_EMOJI = {
        video: '🎬',
        audio: '🎵',
        apps: '💻',
        games: '🎮',
        books: '📚',
        other: '📁'
    };
    function showNotFound(unavailable = false) {
        document.getElementById('bag-detail').style.display = 'none';
        const box = document.getElementById('bag-not-found');
        box.style.display = 'block';
        box.querySelector('p').dataset.i18n = unavailable ? 'chain_unavailable' : 'bag_not_found';
        box.querySelector('p').textContent = t(unavailable ? 'chain_unavailable' : 'bag_not_found');
        document.getElementById('retry-bag').hidden = !unavailable;
    }
    function renderBag(db, storage) {
        const version = document.getElementById('bag-version');
        version.hidden = db.version !== 'v3';
        if (db.version === 'v3') {
            version.dataset.i18n = 'v3_publication';
            version.textContent = t('v3_publication');
        }
        else {
            delete version.dataset.i18n;
            version.textContent = '';
        }
        const manage = document.getElementById('manage-publication');
        manage.hidden = db.version !== 'v3';
        if (db.version === 'v3')
            manage.href = 'add.html?publication=' + encodeURIComponent(db.item_address);
        document.title = `${db.name} - piracy.ton`;
        document.getElementById('bag-category').textContent =
            (CATEGORY_EMOJI[db.category] || '📁') + ' ' + db.category;
        document.getElementById('bag-name').textContent = db.name;
        document.getElementById('bag-size').textContent = formatSize(storage?.size_bytes ?? db.size_bytes ?? storage?.size ?? db.size);
        document.getElementById('bag-files-count').textContent = storage?.files_count ?? db.files_count ?? '-';
        document.getElementById('bag-peers').textContent = storage?.peers_count ?? '-';
        document.getElementById('bag-date').textContent = formatDate(db.created_at);
        const uploaderEl = document.getElementById('bag-uploader');
        if (db.uploader_wallet) {
            uploaderEl.innerHTML = `<a href="https://tonscan.org/address/${encodeURIComponent(db.uploader_wallet)}" target="_blank" rel="noopener noreferrer">${escapeHtml(db.uploader_wallet)}</a>`;
        }
        else {
            uploaderEl.textContent = '-';
        }
        document.getElementById('bag-id').textContent = db.bag_id;
        const filesList = document.getElementById('files-list');
        if (storage?.files && storage.files.length > 0) {
            filesList.innerHTML = storage.files.map(f => `
            <div class="file-row">
                <span class="file-name">${escapeHtml(f.name)}</span>
                <span class="file-size">${formatSize(f.size)}</span>
            </div>
        `).join('');
        }
        else {
            filesList.innerHTML = '<p class="no-files" data-i18n="no_files">No files available</p>';
            applyTranslations();
        }
        bindCopy(document.getElementById('bag-id'), db.bag_id);
    }
    return { showNotFound, renderBag, reset() { document.getElementById('bag-detail').style.display = ''; document.getElementById('bag-not-found').style.display = 'none'; } };
}
