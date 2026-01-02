const LANGS = ['en', 'fr', 'ru', 'zh', 'es', 'ar'];
const LANG_NAMES = {
    en: 'EN',
    fr: 'FR',
    ru: 'RU',
    zh: '中文',
    es: 'ES',
    ar: 'ع'
};
const RTL_LANGS = ['ar'];

let translations = {};
let currentLang = 'en';

async function loadTranslations(lang) {
    try {
        const res = await fetch(`/lang/${lang}.json?v=2`);
        if (res.ok) {
            translations = await res.json();
            currentLang = lang;
            localStorage.setItem('lang', lang);
            applyTranslations();
            updateLangSelector();
            applyDirection();
        }
    } catch (err) {
        console.error('Failed to load translations:', err);
    }
}

function t(key) {
    return translations[key] || key;
}

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[key]) {
            el.textContent = translations[key];
        }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (translations[key]) {
            el.placeholder = translations[key];
        }
    });
}

function applyDirection() {
    if (RTL_LANGS.includes(currentLang)) {
        document.documentElement.setAttribute('dir', 'rtl');
    } else {
        document.documentElement.removeAttribute('dir');
    }
}

function updateLangSelector() {
    const selector = document.getElementById('lang-selector');
    if (selector) {
        selector.value = currentLang;
    }
}

function initLang() {
    const saved = localStorage.getItem('lang');
    loadTranslations(saved || 'en');
}

function createLangSelector() {
    const selector = document.createElement('select');
    selector.id = 'lang-selector';
    selector.className = 'lang-selector';

    LANGS.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang;
        option.textContent = LANG_NAMES[lang];
        selector.appendChild(option);
    });

    selector.addEventListener('change', (e) => {
        loadTranslations(e.target.value);
    });

    return selector;
}

document.addEventListener('DOMContentLoaded', () => {
    const headerRight = document.querySelector('.header-right');
    if (headerRight) {
        const selector = createLangSelector();
        headerRight.insertBefore(selector, headerRight.firstChild);
    }
    initLang();
});
