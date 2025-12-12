const API_URL = '/api';

const CATEGORY_EMOJI = {
    video: '🎬',
    audio: '🎵',
    apps: '💻',
    games: '🎮',
    books: '📚',
    other: '📁'
};

function formatSize(bytes) {
    if (!bytes) return '-';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
        bytes /= 1024;
        i++;
    }
    return bytes.toFixed(bytes >= 10 ? 0 : 1) + ' ' + units[i];
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString();
}


async function loadBagDetail() {
    const params = new URLSearchParams(window.location.search);
    const bagId = params.get('id');

    if (!bagId) {
        showNotFound();
        return;
    }

    try {
        const [dbRes, storageRes] = await Promise.all([
            fetch(`${API_URL}/bags/${bagId}`),
            fetch(`${API_URL}/bag-info/${bagId}`)
        ]);

        if (!dbRes.ok) {
            showNotFound();
            return;
        }

        const dbData = await dbRes.json();
        const storageData = storageRes.ok ? await storageRes.json() : null;

        renderBag(dbData, storageData);
    } catch (err) {
        console.error('Error loading bag:', err);
        showNotFound();
    }
}

function showNotFound() {
    document.getElementById('bag-detail').style.display = 'none';
    document.getElementById('bag-not-found').style.display = 'block';
}

function renderBag(db, storage) {
    document.title = `${db.name} - piracy.ton`;

    document.getElementById('bag-category').textContent =
        (CATEGORY_EMOJI[db.category] || '📁') + ' ' + db.category;
    document.getElementById('bag-name').textContent = db.name;
    document.getElementById('bag-size').textContent = storage?.size || db.size || '-';
    document.getElementById('bag-files-count').textContent = storage?.files_count || db.files_count || '-';
    document.getElementById('bag-peers').textContent = storage?.peers_count ?? db.peers_count ?? '-';
    document.getElementById('bag-date').textContent = formatDate(db.created_at);
    const uploaderEl = document.getElementById('bag-uploader');
    if (db.uploader_wallet) {
        uploaderEl.innerHTML = `<a href="https://tonviewer.com/${db.uploader_wallet}" target="_blank">${db.uploader_wallet}</a>`;
    } else {
        uploaderEl.textContent = '-';
    }
    document.getElementById('bag-id').textContent = db.bag_id;

    // Render files list
    const filesList = document.getElementById('files-list');
    if (storage?.files && storage.files.length > 0) {
        filesList.innerHTML = storage.files.map(f => `
            <div class="file-row">
                <span class="file-name">${escapeHtml(f.name)}</span>
                <span class="file-size">${formatSize(f.size)}</span>
            </div>
        `).join('');
    } else {
        filesList.innerHTML = '<p class="no-files" data-i18n="no_files">No files available</p>';
        if (window.applyTranslations) window.applyTranslations();
    }

    // Copy button
    document.getElementById('copy-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(db.bag_id);
        const btn = document.getElementById('copy-btn');
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 1500);
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Theme toggle
const themeToggle = document.getElementById('theme-toggle');
const iconMoon = document.getElementById('icon-moon');
const iconSun = document.getElementById('icon-sun');

function setTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
    iconMoon.style.display = dark ? 'none' : 'block';
    iconSun.style.display = dark ? 'block' : 'none';
}

const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    setTheme(true);
}

themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    setTheme(!isDark);
});

loadBagDetail();
