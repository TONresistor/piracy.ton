import { readPreference, savePreference } from '../services/storage.js';
import { LANGS, RTL_LANGS } from './languages.js';
import localeFiles from './locale-files.js';
export { LANGS, LANG_NAMES, LANG_LABELS, RTL_LANGS } from './languages.js';
export const getLanguage = () => currentLang;
let translations = {};
let currentLang = 'en';
let languageRequest = 0;
export async function loadTranslations(lang) {
    if (!LANGS.includes(lang))
        return;
    const request = ++languageRequest;
    try {
        const res = await fetch(new URL(localeFiles[lang], window.location.href));
        if (res.ok) {
            const nextTranslations = await res.json();
            if (request !== languageRequest)
                return;
            translations = nextTranslations;
            currentLang = lang;
            savePreference('lang', lang);
            applyTranslations();
            applyDirection();
            window.dispatchEvent(new CustomEvent('piracy:language-changed', { detail: { lang } }));
        }
    }
    catch (err) {
        console.error('Failed to load translations:', err);
    }
}
export function t(key) {
    return translations[key] || key;
}
export function applyTranslations() {
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
    document.documentElement.setAttribute('lang', currentLang);
    if (RTL_LANGS.includes(currentLang)) {
        document.documentElement.setAttribute('dir', 'rtl');
    }
    else {
        document.documentElement.removeAttribute('dir');
    }
}
export function initI18n() {
    const saved = readPreference('lang');
    loadTranslations(LANGS.includes(saved) ? saved : 'en');
}
