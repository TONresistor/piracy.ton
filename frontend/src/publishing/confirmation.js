import { confirmationState } from '../../../shared/contract-sdk/dist/browser.js';

export function createPublicationObserver({ api, getPending, clearPending, onConfirmed, onRejected, onPending, onSettled }) {
    let observation;
    return function observe() {
        if (observation) return observation;
        const attempt = getPending();
        if (!attempt) return Promise.resolve();
        observation = (async () => {
            try {
                let item;
                try { item = await api('v3/publications/' + encodeURIComponent(attempt.address)); }
                catch (error) { if (error.message !== 'publication_not_found') throw error; }
                if (getPending() !== attempt) return;
                const result = item ? confirmationState(attempt, item) : 'pending';
                if (result !== 'pending') {
                    if (!clearPending()) return;
                    onConfirmed(item, result);
                } else {
                    if (attempt.boc) {
                        const receipt = await api('v3/transaction', { boc: attempt.boc, wallet: attempt.wallet,
                            bagId: attempt.bagId, payload: attempt.payload, operation: attempt.operation, validUntil: attempt.validUntil });
                        if (getPending() !== attempt) return;
                        if (receipt.state === 'rejected') {
                            if (clearPending()) onRejected(receipt);
                            return;
                        }
                    }
                    onPending();
                }
            } catch {
                if (getPending() === attempt) onPending();
            } finally {
                observation = null;
                onSettled();
            }
        })();
        return observation;
    };
}
