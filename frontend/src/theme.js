import { readPreference, savePreference } from './services/storage.js';
export function initTheme() {
    const root = document.documentElement;
    function applyTheme(dark) {
        root.setAttribute('data-theme', dark ? 'dark' : 'light');
        window.dispatchEvent(new CustomEvent('piracy:theme-changed'));
        const moon = document.getElementById('icon-moon');
        const sun = document.getElementById('icon-sun');
        if (moon)
            moon.style.display = dark ? 'none' : 'block';
        if (sun)
            sun.style.display = dark ? 'block' : 'none';
    }
    const saved = readPreference('theme');
    const startDark = saved === 'dark'
        || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    applyTheme(startDark);
    function wireToggle() {
        const toggle = document.getElementById('theme-toggle');
        if (!toggle)
            return;
        toggle.addEventListener('click', () => {
            const dark = root.getAttribute('data-theme') !== 'dark';
            savePreference('theme', dark ? 'dark' : 'light');
            applyTheme(dark);
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wireToggle);
    }
    else {
        wireToggle();
    }
}
