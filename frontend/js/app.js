// Theme toggle
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
        video: '🎬',
        audio: '🎵',
        apps: '💻',
        games: '🎮',
        books: '📚',
        other: '📁'
    };

    bags.forEach(bag => {
        const tr = document.createElement('tr');
        tr.className = 'clickable-row';
        tr.innerHTML = `
            <td class="type-icon">${icons[bag.category] || '📁'}</td>
            <td class="bag-name">${escapeHtml(bag.name)}</td>
            <td>${bag.size || '-'}</td>
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
        // Click on row to open detail
        tr.addEventListener('click', () => {
            window.location.href = 'bag.html?id=' + bag.bag_id;
        });
        // Click on bag ID to copy
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
