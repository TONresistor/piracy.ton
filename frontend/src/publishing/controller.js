import { createPublicationObserver } from './confirmation.js';
import * as sdk from '../../../shared/contract-sdk/dist/browser.js';
import { request } from '../services/api.js';
import { classifyTonConnectError } from '../services/wallet.js';
import { readPending, savePending, clearPending } from '../services/storage.js';
import { createLegacyObserver } from '../legacy/confirmation.js';
import { validatePending, validatePublication } from './validation.js';
import { createPublishingForm } from './form.js';
import { t } from '../i18n/index.js';
export function createPublishingController({ ui, doc = document, browser = window, storage = localStorage, api = request, translate = t, schedule = setTimeout, search = location.search }) {
    const form = createPublishingForm(doc, translate);
    const $ = form.element, tr = translate, status = form.status;
    const editAddress = new URLSearchParams(search).get('publication');
    let wallet, restored = false, config, publication, busy = false, pending, storageBlocked = false;
    let refreshRequest;
    try {
        const saved = readPending(storage, validatePending);
        pending = saved.pending;
        if (saved.discarded)
            status('v3_storage_error');
    }
    catch {
        storageBlocked = true;
        status('v3_storage_error');
    }
    function canSign() { return restored && wallet?.account?.chain === sdk.CHAIN; }
    function render() {
        const canEdit = !publication || !wallet ? false : sdk.normalizeAddress(wallet.account.address) === publication.uploader_wallet;
        form.render({ pending, storageBlocked, busy, restored, config, wrongNetwork: Boolean(wallet && wallet.account.chain !== sdk.CHAIN), signed: canSign(), editAddress, canEdit });
    }
    const observeLegacy = createLegacyObserver({ api, storage, element: $, translate: tr });
    ui.onStatusChange(value => { wallet = value; render(); });
    ui.connectionRestored.then(() => { restored = true; wallet = ui.wallet; render(); });
    function forgetPending() {
        try {
            clearPending(storage);
            pending = null;
            return true;
        }
        catch {
            storageBlocked = true;
            status('v3_storage_error');
            return false;
        }
    }
    const observe = createPublicationObserver({
        api,
        getPending: () => pending,
        clearPending: forgetPending,
        onPending: () => status(storageBlocked ? 'v3_storage_error' : 'v3_pending'),
        onRejected: receipt => { $('upload-status').textContent = tr('tx_rejected_contract').replace('{code}', String(receipt.exitCode ?? '?')); },
        onSettled: render,
        onConfirmed(item, result) {
            form.confirmed(item, result);
            if (editAddress) { publication = item; form.fill(item); }
        }
    });
    // A wallet BOC only acknowledges signing. Success requires the expected chain state.
    $('submit-bag').addEventListener('click', async () => {
        if (canSign() || busy || pending || !restored || !config?.ready)
            return;
        try {
            await ui.openModal();
        }
        catch (error) {
            status(classifyTonConnectError(error));
        }
    });
    $('upload-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!canSign() || storageBlocked || busy || pending)
            return;
        busy = true;
        render();
        let walletRequested = false;
        try {
            const owner = sdk.normalizeAddress(wallet.account.address);
            const fields = validatePublication(form.fields());
            const quote = await api('v3/prepare', { ...fields, operation: editAddress ? 'update' : 'publish', wallet_address: owner, revision: publication?.revision });
            if (quote.existing) {
                location.href = 'add.html?publication=' + encodeURIComponent(quote.publication.item_address);
                return;
            }
            if (quote.network !== sdk.CHAIN || quote.address !== sdk.publicationAddress(owner, fields.bagId))
                throw new Error('transaction_mismatch');
            if (!canSign() || sdk.normalizeAddress(ui.wallet.account.address) !== owner)
                throw new Error('wallet_mismatch');
            const transaction = sdk.buildTransaction({ ...fields, operation: quote.operation, wallet: owner, network: sdk.CHAIN, amount: quote.amount, queryId: quote.queryId, revision: quote.revision });
            // Persist before opening the mobile wallet: reloads and ambiguous errors must not resend.
            const changed = publication && (publication.title !== fields.title || publication.category !== fields.category || publication.visible !== fields.visible);
            const attempt = { version: 1, payload: transaction.messages[0].payload, ...fields, operation: quote.operation, wallet: owner, address: quote.address,
                expectedRevision: quote.operation === 'update' ? (BigInt(quote.revision) + (changed ? 1n : 0n)).toString() : '0', validUntil: transaction.validUntil };
            try {
                savePending(storage, attempt);
            }
            catch {
                storageBlocked = true;
                throw new Error('v3_storage_error');
            }
            pending = attempt;
            form.funding(quote.amount);
            status('v3_wallet');
            walletRequested = true;
            const result = await ui.sendTransaction(transaction);
            sdk.transactionReceipt(result.boc, owner);
            attempt.boc = result.boc;
            try { savePending(storage, attempt); }
            catch { storageBlocked = true; status('v3_storage_error'); }
            status(storageBlocked ? 'v3_storage_error' : 'v3_pending');
            await observe();
        }
        catch (error) {
            const classified = classifyTonConnectError(error);
            if (!walletRequested || classified === 'tx_cancelled') {
                if (pending && !forgetPending())
                    return;
                const key = error.message;
                status(storageBlocked ? 'v3_storage_error' : tr(key) !== key ? key : classified);
            }
            else
                status('v3_pending');
        }
        finally {
            busy = false;
            render();
        }
    });
    function refresh() {
        if (refreshRequest)
            return refreshRequest;
        refreshRequest = refreshOnce().finally(() => { refreshRequest = null; });
        return refreshRequest;
    }
    async function refreshOnce() {
        try {
            config = await api('v3/config');
        }
        catch {
            config = { status: 'unavailable', ready: false };
        }
        if (editAddress && !publication) {
            try {
                publication = await api('v3/publications/' + encodeURIComponent(editAddress));
                form.fill(publication);
            }
            catch {
                status('publication_not_found');
            }
        }
        render();
        await observe();
        await observeLegacy();
    }
    $('release-pending').addEventListener('click', async () => {
        await observe();
        if (pending && Date.now() / 1000 >= pending.validUntil + 1800 && forgetPending()) {
            status('v3_superseded');
            render();
        }
    });
    browser.addEventListener('piracy:language-changed', render);
    async function tick() {
        try {
            if (!busy)
                await refresh();
        }
        finally {
            schedule(tick, 10000);
        }
    }
    void tick();
    return { refresh, observe, render };
}
