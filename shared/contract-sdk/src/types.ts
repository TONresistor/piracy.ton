import type { Address, ContractProvider } from '@ton/core';

export type PublicationInput = { bagId?: unknown; title?: unknown; category?: unknown; visible?: unknown };
export type PublicationFields = { bagId: string; title: string; category: string; visible: boolean };
export type ProviderClient = { provider(address: Address): ContractProvider };
export type TransactionInput = PublicationInput & {
    wallet: string; network: string; amount: string; operation: string; queryId: string; revision: string;
};
export type PendingPublication = PublicationFields & { address: string; wallet: string; expectedRevision: string };
export type IndexedPublication = { item_address: string; uploader_wallet: string; bag_id: string; revision: string; title: string; category: string; visible: boolean };
