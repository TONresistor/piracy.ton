import { LEGACY_PENDING_KEY } from '../services/storage.js';
import { isTerminalAttemptState } from './registration.js';
export function createLegacyObserver({ api, storage, element: $, translate: tr }) {
    return async function observeLegacy() {
        try {
            const old = JSON.parse(storage.getItem(LEGACY_PENDING_KEY) || 'null');
            if (!old?.id)
                return;
            if (old.boc)
                await api('registration-attempts/' + encodeURIComponent(old.id) + '/submission', { boc: old.boc });
            if (!old.boc)
                await api('registration-attempts/' + encodeURIComponent(old.id) + '/unknown', {});
            const attempt = await api('registration-attempts/' + encodeURIComponent(old.id));
            $('legacy-status').textContent = 'v2: ' + attempt.state;
            if (isTerminalAttemptState(attempt.state))
                storage.removeItem(LEGACY_PENDING_KEY);
        }
        catch {
            $('legacy-status').textContent = tr('v3_legacy_pending');
        }
    };
}
