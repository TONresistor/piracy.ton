import assert from 'node:assert/strict';
import test from 'node:test';
import { initCategoryPicker } from '../src/components/category-picker.js';
import { initLanguageMenu } from '../src/components/language-menu.js';
import { createPublishingForm } from '../src/publishing/form.js';

function dom() {
    const all = [];
    const document = { activeElement: null, events: {}, addEventListener(name, fn) { this.events[name] = fn; } };
    class Element {
        constructor(tag = 'div') { this.tagName = tag; this.children = []; this.attrs = {}; this.dataset = {}; this.events = {}; this.style = {}; this.value = ''; this.hidden = false; this.classList = { toggle() {} }; all.push(this); }
        append(...children) { this.children.push(...children); }
        appendChild(child) { this.append(child); }
        insertBefore(child) { this.children.unshift(child); }
        setAttribute(name, value) { this.attrs[name] = value; }
        removeAttribute(name) { delete this.attrs[name]; }
        getAttribute(name) { return this.attrs[name]; }
        addEventListener(name, fn) { this.events[name] = fn; }
        focus() { document.activeElement = this; }
        contains(node) { return node === this || this.children.some(child => child.contains(node)); }
        querySelector(selector) { return all.find(node => node.className === selector.slice(1)); }
        querySelectorAll() { return this.children; }
        set innerHTML(_html) { const current = new Element('span'); current.className = 'lang-current'; this.append(current); }
    }
    document.createElement = tag => new Element(tag);
    document.getElementById = id => all.find(node => node.id === id);
    document.querySelector = selector => all.find(node => '.' + node.className === selector);
    document.querySelectorAll = selector => selector === '.lang-option' ? all.filter(node => node.className === 'lang-option') : [];
    document.documentElement = new Element('html');
    const node = id => { const element = new Element(); element.id = id; return element; };
    return { document, node, Element };
}
const key = key => ({ key, preventDefault() {}, stopPropagation() {} });

test('custom category picker preserves free text, keyboard selection and dismissal', () => {
    const h = dom();
    const picker = h.node('category-picker'), input = h.node('bag-category'), menu = h.node('category-menu'), toggle = h.node('category-toggle');
    menu.hidden = true;
    const options = ['video', 'audio', 'apps', 'games', 'books', 'other'].map(category => { const option = h.node('category-' + category); option.dataset.category = category; return option; });
    menu.append(...options); picker.append(input, menu, toggle);
    initCategoryPicker(h.document);
    toggle.events.click(); assert.equal(menu.hidden, false);
    options[1].events.click(); assert.equal(input.value, 'audio'); assert.equal(menu.hidden, true);
    input.value = 'custom-topic'; input.events.input(); assert.equal(input.value, 'custom-topic');
    input.events.keydown(key('ArrowDown')); input.events.keydown(key('Enter'));
    assert.equal(input.value, 'video'); assert.equal(menu.hidden, true);
    toggle.events.click(); input.events.keydown(key('Escape')); assert.equal(menu.hidden, true);
    toggle.events.click(); h.document.events.pointerdown({ target: {} }); assert.equal(menu.hidden, true);
});

test('language menu retains active language, persistence, keyboard and RTL behavior', async () => {
    const h = dom(); const header = new h.Element(); header.className = 'header-right';
    const saved = new Map(), handlers = {};
    const previous = Object.fromEntries(['document', 'window', 'fetch', 'localStorage'].map(name => [name, globalThis[name]]));
    Object.assign(globalThis, { document: h.document, window: { location: { href: 'https://example.test/add.html' }, addEventListener: (name, fn) => { handlers[name] = fn; }, dispatchEvent: event => handlers[event.type]?.(event) },
        localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) }, fetch: async () => ({ ok: true, json: async () => ({}) }) });
    try {
        initLanguageMenu();
        const trigger = h.document.getElementById('lang-selector'), menu = h.document.getElementById('lang-menu');
        const options = menu.children;
        trigger.events.click(); assert.equal(menu.hidden, false); assert.equal(h.document.activeElement, options[0]);
        menu.events.keydown(key('ArrowDown')); assert.equal(h.document.activeElement, options[1]);
        options[1].events.click(); await new Promise(setImmediate);
        assert.equal(saved.get('lang'), 'fr'); assert.equal(options[1].attrs['aria-checked'], 'true'); assert.equal(menu.hidden, true);
        trigger.events.keydown(key('ArrowUp')); assert.equal(h.document.activeElement, options[5]);
        menu.events.keydown(key('Escape')); assert.equal(h.document.activeElement, trigger);
        trigger.events.click(); options[5].events.click(); await new Promise(setImmediate);
        assert.equal(h.document.documentElement.attrs.dir, 'rtl'); assert.equal(saved.get('lang'), 'ar');
    } finally { Object.assign(globalThis, previous); }
});

test('publishing form keeps edited visibility and distinguishes connect, publish and save', () => {
    const nodes = new Map(); const doc = { getElementById(id) { if (!nodes.has(id)) nodes.set(id, { style: {}, dataset: {} }); return nodes.get(id); } };
    const form = createPublishingForm(doc, key => key);
    form.fill({ bag_id: '12'.repeat(32), title: 'Title', category: 'custom', visible: false });
    assert.equal(form.fields().visible, false); assert.equal(form.fields().category, 'custom');
    form.render({ config: { ready: true }, restored: true, signed: false });
    assert.equal(nodes.get('submit-bag').type, 'button'); assert.equal(nodes.get('submit-bag').textContent, 'v3_connect_action');
    form.render({ config: { ready: true }, restored: true, signed: true });
    assert.equal(nodes.get('submit-bag').type, 'submit'); assert.equal(nodes.get('submit-bag').textContent, 'v3_publish');
    form.render({ config: { ready: true }, restored: true, signed: true, editAddress: 'publication', canEdit: true });
    assert.equal(nodes.get('submit-bag').textContent, 'v3_save'); assert.equal(Boolean(nodes.get('submit-bag').disabled), false);
});
