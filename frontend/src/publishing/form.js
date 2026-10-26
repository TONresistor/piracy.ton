export function createPublishingForm(doc, translate) {
    const $ = id => doc.getElementById(id);
    const tr = translate;
    const status = (key, extra = '') => { $('upload-status').textContent = tr(key) + (extra ? ' ' + extra : ''); };
    function render({ pending, storageBlocked, busy, restored, config, wrongNetwork, signed, editAddress, canEdit }) {
        $('release-pending').hidden = !pending || Date.now() / 1000 < pending.validUntil + 1800;
        $('upload-form').style.display = 'grid';
        $('wallet-status').textContent = wrongNetwork ? tr('wrong_network') : '';
        $('submit-bag').type = signed ? 'submit' : 'button';
        $('submit-bag').disabled = storageBlocked || busy || !!pending || !restored || !config?.ready || wrongNetwork || (!!editAddress && signed && !canEdit);
        $('submit-bag').textContent = tr(signed ? (editAddress ? 'v3_save' : 'v3_publish') : 'v3_connect_action');
        $('connect-msg').textContent = config?.ready ? '' : tr(config?.status === 'undeployed' ? 'v3_not_ready' : 'chain_unavailable');
        $('connect-msg').hidden = Boolean(config?.ready);
    }
    function fill(item) {
        $('bag-id').value = item.bag_id;
        $('bag-id').readOnly = true;
        $('bag-name').value = item.title;
        $('bag-category').value = item.category;
        $('bag-visible').checked = item.visible;
    }
    return { element: $, render, fill, status,
        fields: () => ({ bagId: $('bag-id').value, title: $('bag-name').value, category: $('bag-category').value, visible: $('bag-visible').checked }),
        funding: amount => { $('funding').textContent = (Number(amount) / 1e9).toFixed(9) + ' GRAM — ' + tr('v3_refund'); },
        confirmed(item, result) {
            status(result === 'confirmed' ? 'v3_confirmed' : 'v3_superseded');
            const link = doc.createElement('a');
            link.href = 'bag.html?id=' + encodeURIComponent(item.bag_id) + '&publication=' + encodeURIComponent(item.item_address);
            link.textContent = tr('v3_view');
            $('upload-status').append(' ', link);
        }
    };
}
