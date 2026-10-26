export function initFooter() {
    const container = document.querySelector('.footer-flag');
    if (!container)
        return;
    const loadPlayer = window.lottie
        ? Promise.resolve(window.lottie)
        : new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '/js/lottie_light.min.js?v=5.13.0';
            script.async = true;
            script.onload = () => window.lottie ? resolve(window.lottie) : reject(new Error('Lottie player unavailable'));
            script.onerror = reject;
            document.head.appendChild(script);
        });
    const loadAnimation = fetch('/assets/animations/mtonga.json?v=1').then((response) => {
        if (!response.ok)
            throw new Error(`MTONGA animation returned ${response.status}`);
        return response.json();
    });
    Promise.all([loadPlayer, loadAnimation]).then(([lottie, animationData]) => {
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const animation = lottie.loadAnimation({
            container,
            renderer: 'svg',
            loop: !reducedMotion,
            autoplay: !reducedMotion,
            animationData
        });
        if (reducedMotion)
            animation.goToAndStop(0, true);
    }).catch(() => undefined);
}
