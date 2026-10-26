import { LANGS, LANG_NAMES, LANG_LABELS, RTL_LANGS, getLanguage, loadTranslations } from '../i18n/index.js';
function updateLangSelector() {
    const trigger = document.getElementById('lang-selector');
    if (!trigger)
        return;
    trigger.querySelector('.lang-current').textContent = LANG_NAMES[getLanguage()];
    trigger.setAttribute('aria-label', 'Language: ' + LANG_LABELS[getLanguage()]);
    document.querySelectorAll('.lang-option').forEach(option => {
        option.setAttribute('aria-checked', String(option.dataset.lang === getLanguage()));
    });
}
export function createLangSelector(doc = document) {
    const picker = doc.createElement('div');
    picker.className = 'lang-picker';
    const trigger = doc.createElement('button');
    trigger.type = 'button';
    trigger.id = 'lang-selector';
    trigger.className = 'lang-selector';
    trigger.setAttribute('aria-label', 'Language');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'lang-menu');
    trigger.innerHTML = '<span class="lang-current">EN</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';
    const menu = doc.createElement('div');
    menu.id = 'lang-menu';
    menu.className = 'lang-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Language');
    const options = LANGS.map(lang => {
        const option = doc.createElement('button');
        option.type = 'button';
        option.className = 'lang-option';
        option.dataset.lang = lang;
        option.lang = lang;
        option.dir = RTL_LANGS.includes(lang) ? 'rtl' : 'ltr';
        option.tabIndex = -1;
        option.setAttribute('role', 'menuitemradio');
        option.setAttribute('aria-checked', String(lang === getLanguage()));
        const label = doc.createElement('span');
        label.textContent = LANG_LABELS[lang];
        const check = doc.createElement('span');
        check.className = 'lang-check';
        check.setAttribute('aria-hidden', 'true');
        check.textContent = '✓';
        option.append(label, check);
        option.addEventListener('click', () => { close(true); loadTranslations(lang); });
        menu.appendChild(option);
        return option;
    });
    function close(restoreFocus = false) {
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        if (restoreFocus)
            trigger.focus();
    }
    function open(index = LANGS.indexOf(getLanguage())) {
        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        options[Math.max(0, index)].focus();
    }
    trigger.addEventListener('click', () => menu.hidden ? open() : close());
    trigger.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            open(event.key === 'ArrowUp' ? options.length - 1 : 0);
        }
        else if (event.key === 'Escape')
            close();
    });
    menu.addEventListener('keydown', event => {
        const index = options.indexOf(doc.activeElement);
        let next;
        if (event.key === 'ArrowDown')
            next = (index + 1) % options.length;
        if (event.key === 'ArrowUp')
            next = (index - 1 + options.length) % options.length;
        if (event.key === 'Home')
            next = 0;
        if (event.key === 'End')
            next = options.length - 1;
        if (next !== undefined) {
            event.preventDefault();
            options[next].focus();
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close(true);
        }
        if (event.key === 'Tab')
            close(true);
    });
    doc.addEventListener('pointerdown', event => { if (!picker.contains(event.target))
        close(); });
    picker.addEventListener('focusout', event => { if (!picker.contains(event.relatedTarget))
        close(); });
    picker.append(trigger, menu);
    return picker;
}
export function initLanguageMenu() {
    const headerRight = document.querySelector('.header-right');
    if (headerRight)
        headerRight.insertBefore(createLangSelector(), headerRight.firstChild);
    updateLangSelector();
    window.addEventListener('piracy:language-changed', updateLangSelector);
}
