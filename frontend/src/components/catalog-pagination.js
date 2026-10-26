export function renderPagination(catalog, document, t) {
    const pages = Math.max(1, Math.ceil(catalog.total / catalog.limit));
    const pagination = document.getElementById('catalog-pagination');
    pagination.hidden = !catalog.loaded || catalog.error || catalog.total === 0;
    pagination.setAttribute('aria-label', t('pagination_label'));
    document.getElementById('previous-page').disabled = catalog.loading || catalog.page <= 1;
    document.getElementById('next-page').disabled = catalog.loading || catalog.page >= pages;
    const values = {
        start: (catalog.page - 1) * catalog.limit + 1,
        end: Math.min(catalog.page * catalog.limit, catalog.total),
        total: catalog.total, page: catalog.page, pages
    };
    document.getElementById('page-status').textContent = Object.entries(values).reduce((label, [key, value]) => label.replaceAll(`{${key}}`, String(value)), t('pagination_status'));
}
