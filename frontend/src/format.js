export function formatSize(bytes) {
    if (bytes === null || bytes === undefined || bytes === '')
        return '-';
    const match = String(bytes).trim().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)?$/i);
    if (!match)
        return '-';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let size = Number(match[1]) * 1024 ** Math.max(0, units.indexOf((match[2] || 'B').toUpperCase()));
    if (!Number.isFinite(size))
        return '-';
    if (size === 0)
        return '0 B';
    while (size >= 1024 && i < units.length - 1) {
        size /= 1024;
        i++;
    }
    return size.toFixed(size >= 10 ? 0 : 1) + ' ' + units[i];
}
export function formatDate(dateStr) {
    if (!dateStr)
        return '-';
    return new Date(dateStr).toLocaleDateString();
}
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}
