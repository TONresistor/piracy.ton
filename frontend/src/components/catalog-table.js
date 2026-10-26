import { formatSize, formatDate, escapeHtml } from '../format.js';
import { bindCopy } from '../clipboard.js';
import { t } from '../i18n/index.js';
export function createCatalogTable(document, window, translate = t) {
    const t = translate;
    function setTableMessage(key) {
        const tbody = document.getElementById('bags-list');
        tbody.setAttribute('aria-busy', 'false');
        tbody.innerHTML = `<tr><td colspan="7" class="table-empty">${t(key)}</td></tr>`;
    }
    function setTableSkeleton() {
        const tbody = document.getElementById('bags-list');
        const row = `
        <tr class="skeleton-row" aria-hidden="true">
            <td><span class="skeleton skeleton-icon"></span></td>
            <td><span class="skeleton skeleton-name"></span></td>
            <td><span class="skeleton skeleton-value"></span></td>
            <td><span class="skeleton skeleton-count"></span></td>
            <td><span class="skeleton skeleton-count"></span></td>
            <td><span class="skeleton skeleton-date"></span></td>
            <td><span class="skeleton skeleton-id"></span></td>
        </tr>`;
        tbody.setAttribute('aria-busy', 'true');
        tbody.innerHTML = row.repeat(5);
    }
    function renderBags(bags) {
        const tbody = document.getElementById('bags-list');
        tbody.setAttribute('aria-busy', 'false');
        tbody.innerHTML = '';
        const icons = {
            video: '<svg class="type-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m10 8 6 4-6 4Z"/></svg>',
            audio: '<svg class="type-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
            apps: '<svg class="type-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 6h.01M12 6h.01M8 12h8"/></svg>',
            games: '<svg class="type-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" x2="10" y1="11" y2="11"/><line x1="8" x2="8" y1="9" y2="13"/><line x1="15" x2="15.01" y1="12" y2="12"/><line x1="18" x2="18.01" y1="10" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/></svg>',
            books: '<svg class="type-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>',
            other: '<svg class="type-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>'
        };
        bags.forEach(bag => {
            const tr = document.createElement('tr');
            tr.className = 'clickable-row';
            tr.tabIndex = 0;
            tr.setAttribute('role', 'link');
            tr.setAttribute('aria-label', bag.name);
            tr.innerHTML = `
            <td class="type-icon">${icons[bag.category] || icons.other}</td>
            <td class="bag-name">${escapeHtml(bag.name)} <small>${bag.version === 'v3' ? 'v3' : 'v2'}</small></td>
            <td>${formatSize(bag.size_bytes ?? bag.size)}</td>
            <td>${bag.files_count ?? '-'}</td>
            <td>${bag.peers_count ?? '-'}</td>
            <td>${formatDate(bag.created_at)}</td>
            <td>
                <div class="bag-id" role="button" tabindex="0" title="Click to copy" aria-label="Copy Bag ID">
                    <code>${escapeHtml(bag.bag_id)}</code>
                </div>
            </td>
        `;
            const openBag = () => { window.location.href = 'bag.html?id=' + encodeURIComponent(bag.bag_id) + (bag.version === 'v3' ? '&publication=' + encodeURIComponent(bag.item_address) : ''); };
            tr.addEventListener('click', openBag);
            tr.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openBag();
                }
            });
            bindCopy(tr.querySelector('.bag-id'), bag.bag_id, { stopPropagation: true });
            tbody.appendChild(tr);
        });
        if (bags.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="table-empty">${t('no_bags')}</td></tr>`;
        }
    }
    return { setTableMessage, setTableSkeleton, renderBags };
}
