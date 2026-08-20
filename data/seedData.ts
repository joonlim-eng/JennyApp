// AUTO-GENERATED from the JENNY Google Sheet (2026-07-31).
// Catalog lives in seedData.json; replace at runtime via SETTING > Google Connection > SYNC.
import type { Store, Vendor, Product } from '@/context/AppContext';
import raw from './seedData.json';

export const SEED_VERSION: number = raw.version;
export const SEED_STORES = raw.stores as Store[];
export const SEED_VENDORS = raw.vendors as Vendor[];
export const SEED_PRODUCTS = raw.products as Product[];
