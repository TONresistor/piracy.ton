export const MAINNET_CHAIN_ID = '-239';
export const MANIFEST_URL = 'https://piracy.resistance.dog/tonconnect-manifest.json?v=4';
export function classifyTonConnectError(error) {
    // SDK errors intentionally inherit Error.name === "Error" in several
    // builds. The concrete constructor remains stable and is what identifies
    // UserRejectsError, BadRequestError, UnknownAppError, etc.
    const names = new Set([error?.name, error?.constructor?.name].filter(Boolean));
    const code = Number(error?.code ?? error?.cause?.code);
    if (names.has('UserRejectsError') || code === 300)
        return 'tx_cancelled';
    if (names.has('WalletWrongNetworkError'))
        return 'wrong_network';
    if (names.has('WalletNotConnectedError'))
        return 'connect_wallet';
    if (names.has('WalletMissingRequiredFeaturesError') || names.has('WalletNotSupportFeatureError') || code === 400) {
        return 'wallet_unsupported';
    }
    if (names.has('UnknownAppError') || code === 100)
        return 'session_expired';
    if (names.has('BadRequestError'))
        return 'tx_bad_request';
    if (names.has('ManifestNotFoundError')
        || names.has('ManifestContentError')
        || names.has('ManifestContentErrorError')
        || code === 2
        || code === 3) {
        return 'manifest_error';
    }
    return 'tx_failed';
}
function walletPreferences(THEME) {
    const root = document.documentElement;
    const colors = getComputedStyle(root);
    const color = name => colors.getPropertyValue(name).trim();
    const theme = root.dataset.theme === 'dark' ? THEME.DARK : THEME.LIGHT;
    return { theme, colorsSet: { [theme]: {
                accent: color('--ton-blue'),
                telegramButton: color('--ton-blue'),
                connectButton: { background: color('--bg-secondary'), foreground: color('--text-primary') },
                background: { primary: color('--bg-white'), secondary: color('--bg-primary'), segment: color('--bg-secondary'), tint: color('--hover-bg') },
                text: { primary: color('--text-primary'), secondary: color('--text-secondary') },
                icon: { primary: color('--text-primary'), secondary: color('--text-secondary'), tertiary: color('--text-secondary'), success: color('--color-success'), error: color('--color-error') }
            } } };
}
export async function createWalletClient() {
    const { TonConnectUI, THEME } = await import('@tonconnect/ui');
    const ui = new TonConnectUI({ manifestUrl: MANIFEST_URL, buttonRootId: 'ton-connect', uiPreferences: walletPreferences(THEME),
        walletsRequiredFeatures: { sendTransaction: { minMessages: 1 } }, analytics: { mode: 'off' }, actionsConfiguration: { returnStrategy: 'back' } });
    ui.setConnectionNetwork(MAINNET_CHAIN_ID);
    window.addEventListener('piracy:theme-changed', () => { ui.uiOptions = { uiPreferences: walletPreferences(THEME) }; });
    return ui;
}
