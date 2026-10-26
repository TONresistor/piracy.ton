import { LANGS } from './languages.js';
export default Object.fromEntries(LANGS.map(lang => [lang, '/lang/' + lang + '.json']));
