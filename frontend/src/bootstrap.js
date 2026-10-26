import { initTheme } from './theme.js';
import { initI18n } from './i18n/index.js';
import { initLanguageMenu } from './components/language-menu.js';
import { initFooter } from './components/footer.js';
export function initShared() {
    initTheme();
    initLanguageMenu();
    initI18n();
    initFooter();
}
