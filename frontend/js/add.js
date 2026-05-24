function initTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.getElementById('icon-moon').style.display = 'none';
        document.getElementById('icon-sun').style.display = 'block';
    }
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const moon = document.getElementById('icon-moon');
    const sun = document.getElementById('icon-sun');

    if (current === 'dark') {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
        moon.style.display = 'block';
        sun.style.display = 'none';
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        moon.style.display = 'none';
        sun.style.display = 'block';
    }
}

document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
initTheme();

const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: 'https://piracy.resistance.dog/tonconnect-manifest.json',
    buttonRootId: 'ton-connect'
});

let currentWallet = null;
let currentBagMetadata = null;

tonConnectUI.onStatusChange(wallet => {
    currentWallet = wallet;
    const form = document.getElementById('upload-form');
    const msg = document.getElementById('connect-msg');
    if (wallet) {
        form.style.display = 'flex';
        msg.style.display = 'none';
    } else {
        form.style.display = 'none';
        msg.style.display = 'block';
    }
});

document.getElementById('bag-id').addEventListener('blur', async (e) => {
    const bagId = e.target.value.trim().toLowerCase();
    if (!/^[a-fA-F0-9]{64}$/.test(bagId)) {
        currentBagMetadata = null;
        return;
    }

    const status = document.getElementById('upload-status');
    status.textContent = 'Fetching bag info...';

    try {
        const res = await fetch(`/api/bag-info/${bagId}`);
        if (res.ok) {
            const info = await res.json();
            
            currentBagMetadata = {
                description: info.description || '',
                bagSize: info.size_bytes || 0,
                filesCount: info.files_count || 0,
                pieceSize: info.piece_size || 131072,
                merkleHash: info.merkle_hash || '0',
                dirName: info.dir_name || ''
            };
            
            const nameInput = document.getElementById('bag-name');
            if (!nameInput.value && info.description) {
                nameInput.value = info.description;
            }
            
            const sizeStr = info.size || 'Unknown size';
            status.textContent = `${info.files_count} files, ${sizeStr}, ${info.peers_count} peers`;
        } else {
            currentBagMetadata = null;
            status.textContent = 'Bag not found in TON Storage (will still work with defaults)';
        }
    } catch (err) {
        currentBagMetadata = null;
        status.textContent = 'Could not fetch bag info';
    }
});

document.getElementById('upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!currentWallet) {
        alert(t('connect_wallet'));
        return;
    }

    const bagId = document.getElementById('bag-id').value.trim().toLowerCase();
    const name = document.getElementById('bag-name').value.trim();
    const category = document.getElementById('bag-category').value;
    const status = document.getElementById('upload-status');

    if (!/^[a-fA-F0-9]{64}$/.test(bagId)) {
        status.textContent = t('invalid_bagid');
        return;
    }

    if (!name) {
        status.textContent = 'Name is required';
        return;
    }

    if (!category) {
        status.textContent = 'Category is required';
        return;
    }

    status.textContent = t('sending_payment');

    try {
        const payload = await ContractHelper.buildAddBagPayload({
            bagId: bagId,
            name: name,
            category: category,
            description: currentBagMetadata?.description || name,
            bagSize: currentBagMetadata?.bagSize || 0,
            filesCount: currentBagMetadata?.filesCount || 0,
            files: null,
            pieceSize: currentBagMetadata?.pieceSize || 131072,
            merkleHash: currentBagMetadata?.merkleHash || '0',
            dirName: currentBagMetadata?.dirName || ''
        });
        
        console.log('Payload built successfully');

        const transaction = {
            validUntil: Math.floor(Date.now() / 1000) + 600,
            messages: [{
                address: ContractHelper.CONTRACT_ADDRESS,
                amount: ContractHelper.REGISTRATION_FEE,
                payload: payload
            }]
        };

        status.textContent = t('submitting_bag');

        const result = await tonConnectUI.sendTransaction(transaction);

        status.textContent = t('bag_added');
        currentBagMetadata = null;
        document.getElementById('upload-form').reset();

        setTimeout(() => {
            window.location.href = '/';
        }, 2000);

    } catch (err) {
        console.error(err);
        if (err.message?.includes('Cancelled')) {
            status.textContent = t('tx_cancelled');
        } else {
            status.textContent = 'Error: ' + (err.message || 'Transaction failed');
        }
    }
});
