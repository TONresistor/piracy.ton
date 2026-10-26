export function initCategoryPicker(doc = document) {
    const $ = id => doc.getElementById(id);
    const picker = $('category-picker'), input = $('bag-category'), menu = $('category-menu'), toggle = $('category-toggle');
    const options = [...menu.querySelectorAll('[data-category]')];
    let active = -1;
    function highlight(index) {
        active = index;
        options.forEach((option, i) => option.classList.toggle('is-active', i === active));
        if (active >= 0)
            input.setAttribute('aria-activedescendant', options[active].id);
        else
            input.removeAttribute('aria-activedescendant');
    }
    function close() {
        menu.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-expanded', 'false');
        highlight(-1);
    }
    function open() {
        menu.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        toggle.setAttribute('aria-expanded', 'true');
        options.forEach(option => option.setAttribute('aria-selected', String(option.dataset.category === input.value)));
        input.focus();
    }
    function choose(option) {
        input.value = option.dataset.category;
        options.forEach(item => item.setAttribute('aria-selected', String(item === option)));
        close();
        input.focus();
    }
    toggle.addEventListener('click', () => menu.hidden ? open() : close());
    input.addEventListener('click', open);
    input.addEventListener('input', () => {
        options.forEach(option => option.setAttribute('aria-selected', String(option.dataset.category === input.value)));
        highlight(-1);
    });
    input.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (menu.hidden)
                open();
            highlight(active < 0 ? (event.key === 'ArrowDown' ? 0 : options.length - 1) : (active + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
        }
        else if (event.key === 'Enter' && !menu.hidden && active >= 0) {
            event.preventDefault();
            choose(options[active]);
        }
        else if (event.key === 'Escape' && !menu.hidden) {
            event.preventDefault();
            event.stopPropagation();
            close();
        }
        else if (event.key === 'Tab')
            close();
    });
    options.forEach(option => {
        option.addEventListener('pointerdown', event => event.preventDefault());
        option.addEventListener('click', () => choose(option));
    });
    doc.addEventListener('pointerdown', event => { if (!picker.contains(event.target))
        close(); });
    picker.addEventListener('focusout', event => { if (!picker.contains(event.relatedTarget))
        close(); });
}
