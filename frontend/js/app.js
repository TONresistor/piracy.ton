function initTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.getElementById('icon-moon').style.display = 'none';
        document.getElementById('icon-sun').style.display = 'block';
    }
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const moon = document.getElementById('icon-moon');
    const sun = document.getElementById('icon-sun');

    if (current === 'dark') {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
        moon.style.display = 'block';
        sun.style.display = 'none';
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        moon.style.display = 'none';
        sun.style.display = 'block';
    }
}

document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
initTheme();

// Format bytes to human readable
function formatSize(bytes) {
    if (!bytes || bytes === 0) return '-';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let size = parseFloat(bytes);
    while (size >= 1024 && i < units.length - 1) {
        size /= 1024;
        i++;
    }
    return size.toFixed(size >= 10 ? 0 : 1) + ' ' + units[i];
}

async function loadBags(query = '', category = '') {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (category) params.set('category', category);

    try {
        const response = await fetch('/api/bags?' + params.toString());
        const data = await response.json();
        renderBags(data.bags);
    } catch (err) {
        console.error('Failed to load bags:', err);
    }
}

function renderBags(bags) {
    const tbody = document.getElementById('bags-list');
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
        tr.innerHTML = `
            <td class="type-icon">${icons[bag.category] || icons.other}</td>
            <td class="bag-name">${escapeHtml(bag.name)}</td>
            <td>${formatSize(bag.size)}</td>
            <td>${bag.files_count || '-'}</td>
            <td>${bag.peers_count || 0}</td>
            <td>${formatDate(bag.created_at)}</td>
            <td>
                <div class="bag-id" title="Click to copy">
                    <code>${bag.bag_id}</code>
                    <svg class="copy-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                </div>
            </td>
        `;
        tr.addEventListener('click', () => {
            window.location.href = 'bag.html?id=' + bag.bag_id;
        });
        tr.querySelector('.bag-id').addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(bag.bag_id);
        });
        tbody.appendChild(tr);
    });

    if (bags.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #708499; padding: 40px;">No bags found</td></tr>';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString();
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

loadBags();
