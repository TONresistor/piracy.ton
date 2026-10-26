import { initShared } from '../bootstrap.js';
import { initCategoryPicker } from '../components/category-picker.js';
import { createWalletClient } from '../services/wallet.js';
import { createPublishingController } from '../publishing/controller.js';
initShared();
initCategoryPicker();
createWalletClient().then(ui => createPublishingController({ ui }));
