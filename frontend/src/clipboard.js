export function bindCopy(element, text, { stopPropagation = false } = {}) {
    const copy = () => navigator.clipboard.writeText(text).then(() => {
        element.classList.add('copied');
        setTimeout(() => element.classList.remove('copied'), 1500);
    }).catch(error => console.error('Copy failed:', error));
    element.addEventListener('click', event => { if (stopPropagation)
        event.stopPropagation(); copy(); });
    element.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (stopPropagation)
                event.stopPropagation();
            copy();
        }
    });
}
