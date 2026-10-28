import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';

//dsgsdgsdg


export const APP_BUILD_KEY = 'v1.04.1017'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState as RNAppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';

export type Role = 'master' | 'admin' | 'staff';

export interface PurchaseAccess {
  email: string;
  departments: ('GM' | 'PRODUCT')[];
  stores: string[];
}

/** 시트의 LEVEL 값(master/administrator/user 등)을 앱 Role로 정규화 */
export function toRole(v: unknown): Role {
  const s = String(v ?? '').trim().toLowerCase();
  if (s.startsWith('master')) return 'master';
  if (s.startsWith('admin')) return 'admin';
  return 'staff';
}
export type UserStatus = 'pending' | 'active';

export interface AppUser {
  email: string;
  role: Role;
  status: UserStatus;
  pin?: string;
  deviceId?: string;
}

export interface Store {
  id: string;
  name: string;
  address: string;
}

export interface ColumnMap {
  upcCol: string;
  upcCol2?: string;
  codeCol: string;
  descCol: string;
  costCol: string;
  imageCol?: string;
}

export interface Vendor {
  id: string;
  name: string;
  salesPerson: string;
  email: string;
  /** +/- button step for this vendor's products (VENDOR tab column I). Default 1. */
  qtyStep?: number;
  map: ColumnMap;
}

export interface Product {
  upc: string;
  itemCode: string;
  description: string;
  cost: string | number;
  vendorId: string;
  imageUrl?: string;
}

function isSevenDollarVendor(vendorId: string): boolean {
  return vendorId.replace(/[^a-z0-9]/gi, '').toUpperCase() === '7DOLLAR';
}

function sevenDollarSku(itemCode: string): string {
  return itemCode.split('/')[0].trim().toUpperCase();
}

export interface CartItem {
  upc: string;
  qty: number;
  vendorId: string;
  opt?: string; // 7 Dollar 수량 옵션
}

// 7 Dollar Unit Price
export function parseItemOptions(itemCode: string) {
  const parts = String(itemCode || '').split('/');
  if (parts.length < 2) return { baseCode: String(itemCode || '').trim(), options: [] };
  const baseCode = parts[0].trim();
  const options = parts.slice(1).map((p) => p.trim()).filter(Boolean);
  return { baseCode, options };
}

// 단위와 가격을 1:1 객체 쌍 배열로 결합
export function getItemOptionPairs(cost: string | number, itemCode: string) {
  const { options } = parseItemOptions(itemCode);
  const costParts = String(cost ?? '0').split('/').map((s) => {
    const num = parseFloat(s.replace(/[^0-9.]/g, ''));
    return isNaN(num) ? 0 : num;
  });

  if (options.length === 0) {
    return [{ opt: '', cleanOpt: '', price: costParts[0] || 0 }];
  }

  return options.map((opt, idx) => ({
    opt,
    cleanOpt: opt.trim().toUpperCase(),
    price: costParts[idx] !== undefined ? costParts[idx] : (costParts[0] || 0),
  }));
}

export function calcPrice(cost: string | number, itemCode: string, selectedOpt?: string) {
  const pairs = getItemOptionPairs(cost, itemCode);
  if (!selectedOpt) return pairs[0].price;

  const clean = selectedOpt.trim().toUpperCase();
  const matched = pairs.find((p) => p.cleanOpt === clean);
  return matched ? matched.price : pairs[0].price;
}
// 7Dollar Unit

export interface SavedCart {
  id: string;
  name: string;
  storeId: string;
  vendorId: string;
  userEmail: string;
  createdAt: string;
  items: CartItem[];
  shipToJBS: boolean;
  department: 'GM' | 'PRODUCT';
  jorderid?: string;
}

export interface Settings {
  appsScriptUrl: string;
  emailTitle: string;
  emailBody: string;
  fontScale: 'small' | 'medium' | 'large';
  syncMode: 'all' | 'vendor';     
  appTitle: string;
  theme: string;
  loginBgColor: string;
  loginTitleColor: string;
  loginSubtitle: string;
  loginSubtitleColor: string;
  loginIconUri: string;
  loginCardColor: string;
  loginLabelText: string;
  loginLabelColor: string;
  loginHintText: string;
  loginHintColor: string;
  loginButtonColor: string;
  loginButtonText: string;
  loginButtonTextColor: string;
}

interface AppState {
  isHapticDisabled: boolean;
  session: { email: string; role: Role; purchaseToken?: string } | null;
  users: AppUser[];
  stores: Store[];
  vendors: Vendor[];
  products: Product[];
  cart: CartItem[];
  scanList: string[];
  savedCarts: SavedCart[];
  selectedStoreId: string | null;
  selectedVendorId: string | null;
  shipToJBS: boolean;
  department: 'GM' | 'PRODUCT';
  settings: Settings;
  // screen customization key/value map, synced with the sheet's APPEARANCE tab
  appearance: Record<string, string>;
  lastSyncAt: string | null;
  seedVersion?: number;
  // 시트의 강제 로그아웃 신호 (SESSION_EPOCH) — 값이 바뀌면 동기화 때 로그아웃
  sessionEpoch?: string;
}

const genId = () =>
  Date.now().toString(36) + Math.random().toString(36).substr(2, 6);

// web-safe base64 (no dependency on global btoa, which RN lacks)
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function base64UrlEncode(str: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const cp = str.charCodeAt(i);
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += B64_CHARS[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += B64_CHARS[b2 & 63];
  }
  return out;
}

// Real catalog data generated from the JENNY Google Sheet (see data/seedData.ts).
// eslint-disable-next-line import/no-cycle
import { SEED_STORES, SEED_VENDORS, SEED_PRODUCTS, SEED_VERSION } from '@/data/seedData';

// current Apps Script deployment — baked in so Google sign-in works before any setup
const DEFAULT_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbxrPhP-NILWUUgkH642jC6ZSIn9kj1fYTZNYg93fBXE24i25MCuAmIqp10QQCc-7FUXqw/exec';

const DEFAULT_SETTINGS: Settings = {
  appsScriptUrl: DEFAULT_APPS_SCRIPT_URL,
  emailTitle: 'Purchase Order',
  emailBody: 'Please find our order details below. Thank you.',
  fontScale: 'small',
  syncMode: 'all',
  appTitle: 'JENNY',
  theme: 'slate',
  loginBgColor: '',
  loginTitleColor: '',
  loginSubtitle: 'Inventory & Order System',
  loginSubtitleColor: '',
  loginIconUri: '',
  loginCardColor: '',
  loginLabelText: 'Sign in with Google',
  loginLabelColor: '',
  loginHintText: 'Only emails registered in the USERS sheet can sign in.',
  loginHintColor: '',
  loginButtonColor: '',
  loginButtonText: 'SIGN IN WITH GOOGLE',
  loginButtonTextColor: '',
};

// login (대문) settings that sync to every device via the sheet's APPEARANCE tab
const LOGIN_SYNC_KEYS: (keyof Settings)[] = [
  'syncMode', // 동기화 방식 — 관리자가 바꾸면 시트(APPEARANCE)로 전 기기에 적용
  'appTitle',
  'loginBgColor',
  'loginTitleColor',
  'loginSubtitle',
  'loginSubtitleColor',
  'loginIconUri',
  'loginCardColor',
  'loginLabelText',
  'loginLabelColor',
  'loginHintText',
  'loginHintColor',
  'loginButtonColor',
  'loginButtonText',
  'loginButtonTextColor',
];
// base64 icons can exceed a sheet cell's 50,000-char limit — split into chunks
const ICON_APPEARANCE_KEY = 'login.loginIconUri';
const ICON_CHUNK = 40000;

const STORAGE_KEY = 'multiorder_state_v1';
const NONCE_KEY = 'multiorder_auth_nonce';
const PRODUCTS_FILE_URI = FileSystem.documentDirectory + 'latest_products.json';

// Designated admin account — always signs in as an active admin.
const ADMIN_EMAIL = 'joonlim@jennybs.com';

interface AppContextValue extends AppState {
  purchaseAccess: PurchaseAccess | null;
  refreshPurchaseAccess: () => void;
  toggleHaptic: () => void;
  appVersion: string;
  loading: boolean;
  // auth
  login: (email: string) => 'active' | 'pending-pin' | 'registered';
  loginWithGoogle: () => Promise<{ ok: boolean; error?: string }>;
  verifyPin: (email: string, pin: string) => boolean;
  logout: () => void;
  // admin user mgmt
  approveUser: (email: string) => string;
  requestAccess: (email: string) => Promise<void>;
  refreshRemoteUsers: () => Promise<{ ok: boolean; message: string }>;
  checkApproval: (email: string) => Promise<boolean>;
  removeUser: (email: string) => void;
  resetDevice: (email: string) => string;
  setUserRole: (email: string, role: Role) => void;
  // selections
  setSelectedStoreId: (id: string | null) => void;
  setSelectedVendorId: (id: string | null) => void;
  setShipToJBS: (v: boolean) => void;
  setDepartment: (v: 'GM' | 'PRODUCT') => void;
  // cart & scan
  addToScanList: (upc: string) => void;
  removeFromScanList: (upc: string, opt?: string) => void;
  setQty: (upc: string, qty: number, opt?: string) => void;
  clearCart: () => void;
  cartTotal: number;
  qtyOf: (upc: string) => number;
  relatedItems: (product: Product) => Product[];
  findAllByUpc: (upc: string) => Product[];
  findByUpc: (upc: string) => Product | undefined;
  searchProducts: (kw: string) => Product[];
  isProductOutOfStock: (product: Product) => boolean;
  // saved carts
  saveCart: () => SavedCart | null;
  loadCart: (id: string) => void;
  deleteSavedCart: (id: string) => void;
  // CRUD (admin)
  upsertStore: (s: Store) => void;
  deleteStore: (id: string) => void;
  upsertVendor: (v: Vendor) => void;
  deleteVendor: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  updateAppearance: (key: string, value: string) => void;
  syncFromSheets: () => Promise<{ ok: boolean; message: string }>;
  syncVendorProducts: (vendorId: string) => Promise<{ ok: boolean; message: string }>;
  forceLogoutAll: () => Promise<{ ok: boolean; message: string }>;
  genId: () => string;
  // sheet operations
  getTabList?: () => Promise<{ ok: boolean; tabs?: { label: string; value: string }[]; message?: string }>;
  importFromSheet?: (tabName: string) => Promise<{ ok: boolean; message?: string }>;
  itemOptionOf?: (upc: string) => string | undefined;
  setItemOption?: (upc: string, opt: string) => void;
  generateJOrderId: () => string;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>({
    isHapticDisabled: false,
    session: null,
    users: [],
    stores: SEED_STORES,
    vendors: SEED_VENDORS,
    products: SEED_PRODUCTS,
    cart: [],
    scanList: [],
    savedCarts: [],
    selectedStoreId: null,
    selectedVendorId: null,
    shipToJBS: false,
    department: 'GM',
    settings: DEFAULT_SETTINGS,
    appearance: {},
    lastSyncAt: null,
    seedVersion: SEED_VERSION,
  });
  const [loading, setLoading] = useState(true);
  // PURCHASE permissions are verified by the server; never persist them locally.
  const [purchaseAccessState, setPurchaseAccessState] = useState<{
    sessionKey: string;
    access: PurchaseAccess;
  } | null>(null);
  const [purchaseAccessRefreshKey, setPurchaseAccessRefreshKey] = useState(0);
  const purchaseEmail = state.session?.email?.trim().toLowerCase() ?? '';
  const purchaseRole = state.session?.role;
  const purchaseToken = state.session?.purchaseToken ?? '';
  const purchaseScriptUrl = state.settings.appsScriptUrl.trim();

  // Bind each authorization response to this exact login session and role.
  // A stale permission from a previous login can never enable the PURCHASE tab.
  const purchaseSessionKey = JSON.stringify([
    purchaseEmail, purchaseRole, purchaseToken, purchaseScriptUrl,
  ]);
  const purchaseAccess = useMemo<PurchaseAccess | null>(() => {
  if (purchaseRole === 'master' && purchaseEmail) {
    return {
      email: purchaseEmail,
      departments: ['GM', 'PRODUCT'],
      stores: ['ALL'],
    };
  }
  return purchaseAccessState?.sessionKey === purchaseSessionKey
    ? purchaseAccessState.access
    : null;
}, [
  purchaseRole,
  purchaseEmail,
  purchaseAccessState,
  purchaseSessionKey,
]);

  const refreshPurchaseAccess = useCallback(() => {
    setPurchaseAccessRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let active = true;
    // STAFF, missing login tokens, and blank settings can never obtain access.
    if (loading || !purchaseEmail || !purchaseToken || !purchaseScriptUrl ||
        (purchaseRole !== 'master' && purchaseRole !== 'admin')) {
      setPurchaseAccessState(null);
      return () => { active = false; };
    }

    const fetchPurchaseAccess = async () => {
      let receivedResponse = false;
      let accessGranted = false;
      try {
        const params = [
          'action=purchaseAccess',
          `token=${encodeURIComponent(purchaseToken)}`,
          `v=${encodeURIComponent(APP_BUILD_KEY)}`,
        ].join('&');
        const url = `${purchaseScriptUrl}${purchaseScriptUrl.includes('?') ? '&' : '?'}${params}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        receivedResponse = true;

        // Fail closed: only accept a complete, explicitly granted server ACL.
        if (json?.ok !== true || json.allowed !== true ||
            !Array.isArray(json.departments) || !Array.isArray(json.stores) ||
            json.departments.length === 0 || json.stores.length === 0) return;

        const departments: ('GM' | 'PRODUCT')[] = [];
        for (const raw of json.departments as unknown[]) {
          if (typeof raw !== 'string') return;
          const department = raw.trim().toUpperCase();
          if (department !== 'GM' && department !== 'PRODUCT') return;
          if (!departments.includes(department)) departments.push(department);
        }

        const stores: string[] = [];
        for (const raw of json.stores as unknown[]) {
          if (typeof raw !== 'string') return;
          const store = raw.trim().toUpperCase();
          if (!store || store.includes(',')) return;
          if (!stores.includes(store)) stores.push(store);
        }
        if (!departments.length || !stores.length ||
            (stores.includes('ALL') && stores.length !== 1)) return;

        if (active) {
          setPurchaseAccessState({
            sessionKey: purchaseSessionKey,
            access: { email: purchaseEmail, departments, stores },
          });
          accessGranted = true;
        }
      } catch {
        // Keep previously verified access during temporary connection errors.
      } finally {
        if (active && receivedResponse && !accessGranted) {
          setPurchaseAccessState(null);
        }
      }
    };
    void fetchPurchaseAccess();
    return () => { active = false; };
  }, [loading, purchaseEmail, purchaseRole, purchaseToken,
      purchaseScriptUrl, purchaseSessionKey, purchaseAccessRefreshKey]);

  // Recheck G/H after returning to the foreground (including web focus).
  useEffect(() => {
    if (loading) return;
    const sub = RNAppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refreshPurchaseAccess();
    });

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const onFocus = () => refreshPurchaseAccess();
      const onVisibility = () => {
        if (document.visibilityState === 'visible') refreshPurchaseAccess();
      };
      window.addEventListener('focus', onFocus);
      document.addEventListener('visibilitychange', onVisibility);
      return () => {
        sub.remove();
        window.removeEventListener('focus', onFocus);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    }
    return () => sub.remove();
  }, [loading, refreshPurchaseAccess]);

  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});

  const itemOptionOf = useCallback((upc: string) => {
    return selectedOptions[upc];
  }, [selectedOptions]);

  const setItemOption = useCallback((upc: string, opt: string) => {
    setSelectedOptions((prev) => ({ ...prev, [upc]: opt }));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<AppState> & { seedVersion?: number };
          // migration: earlier seed used "JBS" as the store name
          if (saved.stores) {
            saved.stores = saved.stores.map((s) =>
              s.name === 'JBS' ? { ...s, name: 'JBS TRADING' } : s,
            );
          }
          // seed migration: replace old sample catalog with the real one,
          // unless the user has already synced live data from Google Sheets.
          if ((saved.seedVersion ?? 1) < SEED_VERSION && !saved.lastSyncAt) {
            delete saved.stores;
            delete saved.vendors;
            delete saved.products;
            saved.selectedStoreId = null;
            saved.selectedVendorId = null;
            saved.cart = [];
            saved.scanList = [];
          }
          (saved as any).seedVersion = SEED_VERSION;
          // scan list is session-only: always start SCAN empty on app launch
          saved.scanList = [];
          // migration: restore the verified production deployment URL.
          // Preserve all other saved settings and local app data.
          if (
            saved.settings &&
            String(saved.settings.appsScriptUrl || '').trim() !== DEFAULT_APPS_SCRIPT_URL
          ) {
            saved.settings.appsScriptUrl = DEFAULT_APPS_SCRIPT_URL;
          }

          // [Track 2] 로컬 파일 시스템에서 상품 카탈로그 읽어오기
          try {
            const fileInfo = await FileSystem.getInfoAsync(PRODUCTS_FILE_URI);
            if (fileInfo.exists) {
              const productsRaw = await FileSystem.readAsStringAsync(PRODUCTS_FILE_URI);
              const parsedProducts = JSON.parse(productsRaw);
              if (Array.isArray(parsedProducts) && parsedProducts.length > 0) {
                saved.products = parsedProducts; // AsyncStorage 데이터 덮어쓰기
              }
            }
          } catch (fileErr) {
            console.warn('Failed to load products from file system', fileErr);
          }

          setState((prev) => ({
            ...prev,
            ...saved,
            // never clobber a live session with a stale stored null (login race)
            session: prev.session ?? saved.session ?? null,
            settings: { ...DEFAULT_SETTINGS, ...(saved.settings ?? {}) },
          }));
        } else {
          // AsyncStorage가 아예 없을 때(최초 설치 등) 파일 시스템 별도 확인 안전망
          try {
            const fileInfo = await FileSystem.getInfoAsync(PRODUCTS_FILE_URI);
            if (fileInfo.exists) {
              const productsRaw = await FileSystem.readAsStringAsync(PRODUCTS_FILE_URI);
              const parsedProducts = JSON.parse(productsRaw);
              if (Array.isArray(parsedProducts) && parsedProducts.length > 0) {
                setState((prev) => ({ ...prev, products: parsedProducts }));
              }
            }
          } catch (e) {}
        }
      } catch {
        // start fresh on parse failure
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (loading) return;

    const { products, ...persistState } = state;

    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persistState)).catch(() => {});
  }, [state, loading]);

  const patch = useCallback((p: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...p }));
  }, []);

  const toggleHaptic = useCallback(() => {
    patch({ isHapticDisabled: !state.isHapticDisabled });
  }, [state.isHapticDisabled, patch]);

  const stateRef = useRef(state);
  stateRef.current = state;

  // 전체 상품 응답 대신 OOS SKU와 마지막 성공 날짜만 저장한다.
  const SEVEN_DOLLAR_OOS_STORAGE_KEY = 'multiorder_7d_oos_v1';

  const [sevenDollarOosSkus, setSevenDollarOosSkus] = useState<Set<string>>(() => new Set());
  const sevenDollarOosRef = useRef<Set<string>>(new Set());
  const sevenDollarOosSuccessDateRef = useRef<string | null>(null);

  const [sevenDollarOosStatus, setSevenDollarOosStatus] = useState<
    'checking' | 'syncing' | 'failed' | 'ready'
  >('checking');

  // 벤더 재선택 및 RETRY마다 한 번의 확인/동기화를 시작한다.
  const [sevenDollarOosAttempt, setSevenDollarOosAttempt] = useState(0);
  const sevenDollarOosLockedRef = useRef(true);

  const localDateKey = () => {
    const now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
  };

  const isSevenDollarWorkLocked = useCallback(() => {
    const vendorId = stateRef.current.selectedVendorId;
    return Boolean(
      vendorId &&
      isSevenDollarVendor(vendorId) &&
      sevenDollarOosLockedRef.current,
    );
  }, []);

  const isProductOutOfStock = useCallback(
    (product: Product): boolean =>
      isSevenDollarVendor(product.vendorId) &&
      sevenDollarOosSkus.has(sevenDollarSku(product.itemCode)),
    [sevenDollarOosSkus],
  );

  const retrySevenDollarOos = useCallback(() => {
    sevenDollarOosLockedRef.current = true;
    setSevenDollarOosStatus('checking');
    setSevenDollarOosAttempt((prev) => prev + 1);
  }, []);

  const continueWithoutSevenDollarOos = useCallback(() => {
    // 이전 목록과 성공 날짜는 변경하지 않고 이번 진입의 잠금만 해제한다.
    sevenDollarOosLockedRef.current = false;
    setSevenDollarOosStatus('ready');
  }, []);

  useEffect(() => {
    if (loading) return;

    if (!state.selectedVendorId || !isSevenDollarVendor(state.selectedVendorId)) {
      sevenDollarOosLockedRef.current = false;
      return;
    }

    let active = true;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;

    sevenDollarOosLockedRef.current = true;
    setSevenDollarOosStatus('checking');

    const unlock = () => {
      if (!active) return;
      sevenDollarOosLockedRef.current = false;
      setSevenDollarOosStatus('ready');
    };

    const refreshOos = async () => {
      const selectedDate = localDateKey();

      // 같은 실행 중 이미 당일 성공했다면 메모리의 목록을 재사용한다.
      if (sevenDollarOosSuccessDateRef.current === selectedDate) {
        unlock();
        return;
      }

      // 앱 재시작 후에도 저장된 목록과 성공 날짜를 복원한다.
      try {
        const raw = await AsyncStorage.getItem(SEVEN_DOLLAR_OOS_STORAGE_KEY);
        if (!active) return;

        if (raw) {
          const cached = JSON.parse(raw);

          if (
            cached &&
            typeof cached.successDate === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(cached.successDate) &&
            Array.isArray(cached.skus) &&
            cached.skus.every(
              (sku: unknown) => typeof sku === 'string' && sku.trim().length > 0,
            )
          ) {
            const cachedOos = new Set<string>(
              cached.skus.map((sku: string) => sku.trim().toUpperCase()),
            );

            sevenDollarOosRef.current = cachedOos;
            sevenDollarOosSuccessDateRef.current = cached.successDate;
            setSevenDollarOosSkus(cachedOos);

            if (cached.successDate === selectedDate) {
              unlock();
              return;
            }
          }
        }
      } catch (error) {
        // 캐시를 읽지 못해도 기존 메모리 목록을 유지하고 다운로드를 시도한다.
        console.warn('7D stock cache load failed:', error);
      }

      if (!active) return;
      setSevenDollarOosStatus('syncing');

      timeout = setTimeout(() => controller.abort(), 60000);

      try {
        const res = await fetch('https://7dollar.app/products/getallfilteredproducts', {
          method: 'POST',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            categoryIds: [],
            subCategoryIds: [],
            manufacturerIds: [],
            startIndex: 0,
            maxCount: 10000,
            productName: '',
          }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!active) return;
        if (controller.signal.aborted) throw new Error('Stock refresh timed out');

        // 전체 목록을 받았을 때만 새 OOS 목록을 적용한다.
        if (
          !Array.isArray(data.products) ||
          !Number.isSafeInteger(data.productCount) ||
          data.productCount <= 0 ||
          data.products.length !== data.productCount
        ) {
          throw new Error('Incomplete product list');
        }

        const nextOos = new Set<string>();
        for (const product of data.products) {
          if (
            typeof product?.sku !== 'string' ||
            !product.sku.trim() ||
            typeof product.canBePurchased !== 'boolean'
          ) {
            throw new Error('Invalid stock data');
          }

          if (product.canBePurchased === false) {
            nextOos.add(product.sku.trim().toUpperCase());
          }
        }

        clearTimeout(timeout);
        timeout = undefined;

        const successDate = localDateKey();

        // 목록과 날짜를 한 번에 저장한 뒤 성공 상태를 적용한다.
        await AsyncStorage.setItem(
          SEVEN_DOLLAR_OOS_STORAGE_KEY,
          JSON.stringify({
            successDate,
            skus: Array.from(nextOos),
          }),
        );

        if (!active) return;

        sevenDollarOosRef.current = nextOos;
        sevenDollarOosSuccessDateRef.current = successDate;
        setSevenDollarOosSkus(nextOos);
        unlock();
      } catch (error) {
        if (!active) return;

        console.warn('7D stock refresh failed:', error);

        // 이전 목록과 성공 날짜를 유지한다. 자동 재시도는 하지 않는다.
        sevenDollarOosLockedRef.current = true;
        setSevenDollarOosStatus('failed');
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
      }
    };

    void refreshOos();

    return () => {
      active = false;
      if (timeout !== undefined) clearTimeout(timeout);
      controller.abort();
    };
  }, [loading, state.selectedVendorId, sevenDollarOosAttempt]);

  const sevenDollarWorkLocked =
    !loading &&
    Boolean(state.selectedVendorId && isSevenDollarVendor(state.selectedVendorId)) &&
    sevenDollarOosStatus !== 'ready';

  // ---------- auth ----------
  // exchanges the one-time code from the OAuth redirect and stores the session
  // 같은 1회용 코드를 두 경로(브라우저 복귀 + 딥링크 안전망)가 동시에 교환하면
  // 늦은 쪽이 실패해서 "로그인 2번" 증상이 생김 — 코드별로 한 번만 교환
  const authExchangesRef = useRef<Map<string, Promise<{ ok: boolean; error?: string }>>>(new Map());

  const completeGoogleLogin = useCallback(
    (oneTime: string): Promise<{ ok: boolean; error?: string }> => {
      const existing = authExchangesRef.current.get(oneTime);
      if (existing) return existing;
      const p = completeGoogleLoginInner(oneTime);
      authExchangesRef.current.set(oneTime, p);
      return p;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const completeGoogleLoginInner = useCallback(
    async (oneTime: string): Promise<{ ok: boolean; error?: string }> => {
      const base = stateRef.current.settings.appsScriptUrl.trim();
      if (!base) return { ok: false, error: 'Apps Script URL not set.' };
      const vRes = await fetch(`${base}?action=authresult&code=${encodeURIComponent(oneTime)}&v=${APP_BUILD_KEY}`);
      const v = await vRes.json();
      if (v.error === 'UPDATE_REQUIRED') {
        Alert.alert('Update Required 업데이트 필요', v.message || 'Please update to the latest version.');
        return { ok: false, error: v.message };
      }
      if (!v.ok || !v.email) return { ok: false, error: v.error ?? 'Sign-in verification failed.' };
      const expected = await AsyncStorage.getItem(NONCE_KEY).catch(() => null);
      if (!expected || v.n !== expected) {
        return { ok: false, error: 'Sign-in verification failed (state mismatch).' };
      }
      AsyncStorage.removeItem(NONCE_KEY).catch(() => {});
      const role: Role = toRole(v.role);
      const session = { email: String(v.email).toLowerCase(), role, purchaseToken: String(v.purchaseToken || '') };
      patch({ session });
      // persist the session immediately — the fire-and-forget state effect can
      // lose the race (browser round-trip may remount the app with stale storage)
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const cur = raw ? JSON.parse(raw) : {};
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cur, session }));
      } catch {}
      return { ok: true };
    },
    [patch],
  );

  // safety net: if tapping "OPEN APP" relaunches/remounts the app (killing the
  // pending browser promise), catch the auth deep link here and finish login
  useEffect(() => {
    if (loading) return;
    const handleUrl = (url: string | null) => {
      if (!url || stateRef.current.session) return;
      const frag = url.split('#')[1] ?? '';
      const code = new URLSearchParams(frag).get('code');
      if (url.includes('auth') && code) completeGoogleLogin(code).catch(() => {});
    };
    Linking.getInitialURL().then(handleUrl).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => handleUrl(e.url));
    return () => sub.remove();
  }, [loading, completeGoogleLogin]);

    const loginWithGoogle = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const base = state.settings.appsScriptUrl.trim();
    if (!base) {
      return { ok: false, error: 'Google connection is not set up.\nSETTING > Google Connection에 Apps Script URL을 먼저 등록하세요.' };
    }
    try {
      const cfgRes = await fetch(`${base}?action=authcfg&v=${APP_BUILD_KEY}`);
      const cfg = await cfgRes.json();
 
      if (cfg.error === 'UPDATE_REQUIRED') {
        Alert.alert('Update Required 업데이트 필요', cfg.message || 'Please update to the latest version');
        return { ok: false, error: cfg.message };
      }

      if (!cfg.clientId) {
        return { ok: false, error: 'Apps Script에 OAUTH_CLIENT_ID가 설정되지 않았습니다.' };
      }
      const redirect = Linking.createURL('auth');
      const nonce = genId() + genId();
      // persist the nonce: if "OPEN APP" relaunches the app, the deep-link
      // handler needs it to verify the login
      await AsyncStorage.setItem(NONCE_KEY, nonce);
      const stateParam = base64UrlEncode(JSON.stringify({ r: redirect, n: nonce }));
      const authUrl =
        'https://accounts.google.com/o/oauth2/v2/auth' +
        `?client_id=${encodeURIComponent(cfg.clientId)}` +
        `&redirect_uri=${encodeURIComponent(cfg.redirectUri || base)}` +
        '&response_type=code&scope=openid%20email&prompt=select_account' +
        `&state=${stateParam}`;

      if (Platform.OS === 'web') {
        window.location.href = authUrl;
        return { ok: true };
      }

      const res = await WebBrowser.openAuthSessionAsync(authUrl, redirect);
      if (res.type !== 'success' || !('url' in res) || !res.url) {
        // the deep-link handler may still complete the login if the app was
        // relaunched by "OPEN APP" — treat this as cancelled only for the UI
        return { ok: false, error: 'Sign-in was cancelled.' };
      }
      const frag = res.url.split('#')[1] ?? '';
      const params = new URLSearchParams(frag);
      const oneTime = params.get('code');
      if (!oneTime) return { ok: false, error: 'Sign-in failed.' };
      // exchange the one-time code server-side — never trust raw URL data
      return await completeGoogleLogin(oneTime);
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  }, [state.settings.appsScriptUrl, completeGoogleLogin]);

  const login = useCallback(
    (emailRaw: string): 'active' | 'pending-pin' | 'registered' => {
      const email = emailRaw.trim().toLowerCase();
      const isAdmin = email === ADMIN_EMAIL;
      const existing = state.users.find((u) => u.email === email);
      if (isAdmin) {
        const users = existing
          ? state.users.map((u) =>
              u.email === email
                ? { ...u, role: 'master' as Role, status: 'active' as UserStatus }
                : u,
            )
          : [
              ...state.users,
              { email, role: 'master' as Role, status: 'active' as UserStatus },
            ];
        patch({ users, session: { email, role: 'master' } });
        return 'active';
      }
      if (existing && existing.status === 'active') {
        patch({ session: { email, role: existing.role } });
        return 'active';
      }
      if (existing) return 'pending-pin';
      const newUser: AppUser = { email, role: 'staff', status: 'pending' };
      patch({ users: [...state.users, newUser] });
      return 'registered';
    },
    [state.users, patch],
  );

  const verifyPin = useCallback(
    (emailRaw: string, pin: string): boolean => {
      const email = emailRaw.trim().toLowerCase();
      const user = state.users.find((u) => u.email === email);
      if (!user || !user.pin || user.pin !== pin.trim()) return false;
      const users = state.users.map((u) =>
        u.email === email
          ? { ...u, status: 'active' as UserStatus, pin: undefined, deviceId: genId() }
          : u,
      );
      patch({ users, session: { email, role: user.role } });
      // mark ACTIVE in the Google Sheet (fire and forget)
      const url = state.settings.appsScriptUrl.trim();
      if (url) {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ v: APP_BUILD_KEY, action: 'activateUser', email }),
        }).catch(() => {});
      }
      return true;
    },
    [state.users, patch],
  );

  const logout = useCallback(() => patch({ session: null }), [patch]);

  const approveUser = useCallback(
    (email: string): string => {
      const pin = Math.floor(1000 + Math.random() * 9000).toString();
      const users = state.users.map((u) =>
        u.email === email ? { ...u, pin } : u,
      );
      patch({ users });
      // mirror the approval to the Google Sheet so the staff device can pick it up
      const url = state.settings.appsScriptUrl.trim();
      if (url) {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ v: APP_BUILD_KEY, action: 'approveUser', email, pin }),
        }).catch(() => {});
      }
      return pin;
    },
    [state.users, state.settings.appsScriptUrl, patch],
  );

  // ---------- remote user flow (approval requests via Google Sheets) ----------

  /** Staff device: record an access request in the Google Sheet. */
  const requestAccess = useCallback(
    async (email: string): Promise<void> => {
      const url = state.settings.appsScriptUrl.trim();
      if (!url) return;
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ v: APP_BUILD_KEY, action: 'requestAccess', email }),
        });
      } catch {
        // offline or script not deployed — request stays local only
      }
    },
    [state.settings.appsScriptUrl],
  );

  /** Admin device: pull pending/approved users from the Google Sheet. */
  const refreshRemoteUsers = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    const url = state.settings.appsScriptUrl.trim();
    if (!url) return { ok: false, message: 'Apps Script URL is not set (SETTING > Google Connection)' };
    try {
      const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}action=users&v=${APP_BUILD_KEY}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      if (data.error === 'UPDATE_REQUIRED') {
        Alert.alert('Update Required 업데이트 필요', data.message || 'Please update to the latest version');
        return { ok: false, message: data.message };
      }
      if (!Array.isArray(data.users)) return { ok: true, message: 'No users in the sheet yet' };
      setState((prev) => {
        const merged = [...prev.users];
        for (const r of data.users) {
          const email = String(r.email ?? '').trim().toLowerCase();
          if (!email) continue;
          const status: UserStatus = r.status === 'active' ? 'active' : 'pending';
          const idx = merged.findIndex((u) => u.email === email);
          if (idx >= 0) {
            const existing = merged[idx];
            merged[idx] = {
              ...existing,
              role: toRole(r.role), // 시트 LEVEL이 최신 기준
              // never downgrade an already-active local user
              status: existing.status === 'active' ? 'active' : status,
              pin: r.pin ? String(r.pin) : existing.pin,
            };
          } else {
            merged.push({
              email,
              role: toRole(r.role),
              status,
              pin: r.pin ? String(r.pin) : undefined,
            });
          }
        }
        // 세션 등급도 시트 기준으로 갱신 (예전 세션에 옛 등급이 남는 문제 방지)
        let session = prev.session;
        if (session) {
          const me = merged.find((u) => u.email === session!.email);
          if (me && me.role !== session.role) session = { ...session, role: me.role };
        }
        return { ...prev, users: merged, session };
      });
      refreshPurchaseAccess();
      return { ok: true, message: `Loaded ${data.users.length} user(s) from the sheet` };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? 'Failed to load users' };
    }
  }, [state.settings.appsScriptUrl, refreshPurchaseAccess]);

  /** Staff device: check whether admin has approved and issued a PIN. */
  const checkApproval = useCallback(
    async (emailRaw: string): Promise<boolean> => {
      const email = emailRaw.trim().toLowerCase();
      // already have a PIN locally (same-device approval)?
      if (state.users.find((u) => u.email === email)?.pin) return true;
      const url = state.settings.appsScriptUrl.trim();
      if (!url) return false;
      try {
        const res = await fetch(
          `${url}${url.includes('?') ? '&' : '?'}action=user&email=${encodeURIComponent(email)}&v=${APP_BUILD_KEY}`,
        );
        if (!res.ok) return false;
        const data = await res.json();
        
        if (data.error === 'UPDATE_REQUIRED') {
          Alert.alert('Update Required 업데이트 필요', data.message || 'Please update to the latest version');
          return false;
        }

        const pin = data.user?.pin ? String(data.user.pin) : '';
        if (!pin) return false;
        setState((prev) => {
          const exists = prev.users.some((u) => u.email === email);
          const users = exists
            ? prev.users.map((u) => (u.email === email ? { ...u, pin } : u))
            : [...prev.users, { email, role: 'staff' as Role, status: 'pending' as UserStatus, pin }];
          return { ...prev, users };
        });
        return true;
      } catch {
        return false;
      }
    },
    [state.users, state.settings.appsScriptUrl],
  );

const removeUser = useCallback(
    (email: string) => {
      patch({ users: state.users.filter((u) => u.email !== email) });
      const url = state.settings.appsScriptUrl.trim();
      if (url) {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ v: APP_BUILD_KEY, action: 'removeUser', email }),
        }).catch(() => {});
      }
    },
    [state.users, state.settings.appsScriptUrl, patch],
  );

  const resetDevice = useCallback(
    (email: string): string => {
      const pin = Math.floor(1000 + Math.random() * 9000).toString();
      const users = state.users.map((u) =>
        u.email === email
          ? { ...u, status: 'pending' as UserStatus, pin, deviceId: undefined }
          : u,
      );
      patch({ users });
      return pin;
    },
    [state.users, patch],
  );

  const setUserRole = useCallback(
    (email: string, role: Role) => {
      patch({
        users: state.users.map((u) => (u.email === email ? { ...u, role } : u)),
      });
    },
    [state.users, patch],
  );

  // ---------- selections ----------
  const setSelectedStoreId = useCallback(
    (id: string | null) => patch({ selectedStoreId: id }),
    [patch],
  );
  const setSelectedVendorId = useCallback(
    (id: string | null) => {
      if (id && isSevenDollarVendor(id)) {
        // 동일 벤더 재선택도 날짜를 다시 확인한다.
        // CONTINUE WITHOUT 이후 재진입 시 당일 성공 기록이 없으면 재다운로드한다.
        sevenDollarOosLockedRef.current = true;
        setSevenDollarOosStatus('checking');
        setSevenDollarOosAttempt((prev) => prev + 1);
      } else {
        sevenDollarOosLockedRef.current = false;
      }

      patch({ selectedVendorId: id });

      // 벤더 선택 시 동기화 모드: 그 벤더 상품만 백그라운드로 최신화
      // (기존 캐시는 즉시 사용 가능 — 도착하면 교체됨)
      if (id && stateRef.current.settings.syncMode === 'vendor') {
        syncVendorProductsRef.current(id).catch(() => {});
      }
    },
    [patch],
  );
  const setShipToJBS = useCallback(
    (v: boolean) => patch({ shipToJBS: v }),
    [patch],
  );
  
  const setDepartment = useCallback(
    (v: 'GM' | 'PRODUCT') => patch({ department: v }),
    [patch],
  );

  // ---------- products / cart ----------

  //캐싱 ($O(1) 검색용)
  const productDict = useMemo(() => {
    const dict: Record<string, Product> = {};
    for (const p of state.products) {
      dict[`${p.upc}_${p.vendorId}`] = p; // "바코드_벤더ID" 조합을 열쇠(Key)로 사용
    }
    return dict;
  }, [state.products]);

  //중복 코드 오류 제거
  const findAllByUpc = useCallback(
  (upc: string) => state.products.filter((p) => p.upc === upc),
  [state.products],
);

  const findByUpc = useCallback(
  (upc: string) => {
    if (!state.selectedVendorId) return state.products.find((p) => p.upc === upc);
    // $O(1)$ 캐싱 핀포인트 검색
    return productDict[`${upc}_${state.selectedVendorId}`];
  },
  [state.products, state.selectedVendorId, productDict],
);

  const qtyOf = useCallback(
  (upc: string, opt?: string) => {
    if (!state.selectedVendorId) return 0;
    return (
      state.cart.find(
        (c) => c.upc === upc && c.vendorId === state.selectedVendorId && c.opt === opt
      )?.qty ?? 0
    );
  },
  [state.cart, state.selectedVendorId],
);

  const addToScanList = useCallback(
    (upc: string) => {
      console.log("=== addToScanList START ===");
  console.log("received upc:", upc);

      setState((prev) => ({
        ...prev,
        // SCAN shows only the item just scanned; previous ones live in CART
        scanList: [upc],
      }));
    },
    [],
  );

  const removeFromScanList = useCallback(
  (upc: string, opt?: string) => {
    setState((prev) => {
      // 1. 해당 옵션만 카트에서 우선 제거
      const newCart = prev.cart.filter(
        (c) => !(c.upc === upc && c.vendorId === prev.selectedVendorId && c.opt === opt)
      );
      
      // 2. 해당 바코드의 다른 옵션이 아직 카트에 남아있는지 확인
      const stillHasOtherOptions = newCart.some(
        (c) => c.upc === upc && c.vendorId === prev.selectedVendorId
      );
      
      // 3. 다른 옵션마저 없다면 스캔 리스트(화면)에서도 카드 제거
      const newScanList = stillHasOtherOptions
        ? prev.scanList
        : prev.scanList.filter((u) => u !== upc);

      return {
        ...prev,
        scanList: newScanList,
        cart: newCart,
      };
    });
  },
  [],
);

  const setQty = useCallback(
  (upc: string, qty: number, opt?: string) => {
    const currentVendorId = stateRef.current.selectedVendorId;
    if (!currentVendorId) return;

    // UI 외의 호출도 OOS 수량 변경을 막는다. 삭제(qty=0)는 허용한다.
    if (qty > 0 && isSevenDollarVendor(currentVendorId)) {
      const product = stateRef.current.products.find(
        (p) => p.upc === upc && p.vendorId === currentVendorId,
      );
      if (product && sevenDollarOosRef.current.has(sevenDollarSku(product.itemCode))) return;
    }

    setState((prev) => {
      const q = Math.max(0, qty);
      const exists = prev.cart.some(
        (c) => c.upc === upc && c.vendorId === currentVendorId && c.opt === opt
      );
      let cart: CartItem[];

      if (q === 0) {
        cart = prev.cart.filter(
          (c) => !(c.upc === upc && c.vendorId === currentVendorId && c.opt === opt)
        );
      } else if (exists) {
        cart = prev.cart.map((c) =>
          c.upc === upc && c.vendorId === currentVendorId && c.opt === opt ? { ...c, qty: q } : c
        );
      } else {
        cart = [...prev.cart, { upc, qty: q, vendorId: currentVendorId, opt }];
      }
      return { ...prev, cart };
    });
  },
  [],
);

  const clearCart = useCallback(
    () => patch({ cart: [], scanList: [] }),
    [patch],
  );

  const cartTotal = useMemo(() => {
  return state.cart.reduce((sum, c) => {
    // $O(1)$ 캐싱
    const p = productDict[`${c.upc}_${c.vendorId}`];
    if (!p) return sum;
    // 파싱 함수를 태워 정확한 단가 계산
    const price = calcPrice(p.cost, p.itemCode, c.opt);
    return sum + (price * c.qty);
  }, 0);
}, [state.cart, productDict]);

  const relatedItems = useCallback(
    (product: Product): Product[] => {
      const prefixMatch = product.itemCode.match(/^[A-Za-z]+/);
      const prefix = prefixMatch ? prefixMatch[0].toUpperCase() : '';
      const words = product.description
        .toUpperCase()
        .split(/[^A-Z0-9&]+/)
        .filter((w) => w.length > 3);

      const pool = state.products.filter(
        (p) => p.vendorId === product.vendorId
      );
const specialVendors = ['7 DOLLAR']; // 향후 추가 벤더 확장 자리 (OR 조건)
      const isSpecialVendor = specialVendors.includes(product.vendorId);

      const scored = pool.map((p) => {
        let score = 0;
        const isPrefixMatch = prefix && p.itemCode.toUpperCase().startsWith(prefix);
        
        if (isPrefixMatch) {
          score += 10000; 
        }
        
        if (!isSpecialVendor && isPrefixMatch) {
          return { p, score };
        }

        // 특정 벤더(7 DOLLAR 등)이거나, 일반 벤더지만 접두사가 불일치할 때 알파 점수(+α) 계산
        const getBrand = (desc: string) => desc.trim().split(/\s+/)[0] || '';
        const baseBrand = getBrand(product.description);
        const targetBrand = getBrand(p.description);

        if (baseBrand && baseBrand === targetBrand) {
          score += 500;
        }

        const pWords = p.description.toUpperCase();
        for (const w of words) {
          const regex = new RegExp(w, 'g');
          const matches = pWords.match(regex);
          if (matches) {
            const count = matches.length;
            score += w.length * count;
          }
        }
        
        return { p, score };
      });
      
      return scored
        .filter((s) => s.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }
          return a.p.itemCode.localeCompare(b.p.itemCode);
        })
        .map((s) => s.p);
    },
    [state.products],
  );

  const searchProducts = useCallback(
    (kw: string): Product[] => {
      const q = kw.toUpperCase();
      if (!q) return [];
      // search is always scoped to the vendor selected on HOME
      if (!state.selectedVendorId) return [];
      const pool = state.products.filter((p) => p.vendorId === state.selectedVendorId);
      
      // 000을 기준으로 배열로 분리 (입력된 공백은 그대로 유지됨)
      const terms = q.split(',,');

      return pool.filter((p) => {
        const desc = p.description.toUpperCase();
        const code = p.itemCode.toUpperCase();
        const upc = p.upc;

        // 분리된 모든 조각(AND 조건)이 셋 중 하나에는 반드시 포함되어야 함
        return terms.every((term) => 
          desc.includes(term) || code.includes(term) || upc.includes(term)
        );
      });
    },
    [state.products, state.selectedVendorId],
  );

  // ---------- saved carts ----------
  const saveCart = useCallback((): SavedCart | null => {
    if (!state.session || !state.selectedStoreId || !state.selectedVendorId)
      return null;
    if (state.cart.length === 0) return null;
    const store = state.stores.find((s) => s.id === state.selectedStoreId);
    const vendor = state.vendors.find((v) => v.id === state.selectedVendorId);
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const yyyy = now.getFullYear();
    let hh = now.getHours();
    const ampm = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12 || 12;
    const min = String(now.getMinutes()).padStart(2, '0');
    const name = `${vendor?.name ?? ''} ${mm}.${dd}.${yyyy} ${store?.name ?? ''} ${String(hh).padStart(2, '0')}:${min}${ampm}`;
    const saved: SavedCart = {
      id: genId(),
      name,
      storeId: state.selectedStoreId,
      vendorId: state.selectedVendorId,
      userEmail: state.session.email,
      createdAt: now.toISOString(),
      items: state.cart,
      shipToJBS: state.shipToJBS,
      department: state.department,
      jorderid: generateJOrderId(),
    };
    // saving archives the cart — the live cart is cleared afterwards
    // (functional update so rapid consecutive actions can't clobber each other)
    setState((prev) => ({
      ...prev,
      savedCarts: [saved, ...prev.savedCarts],
      cart: [],
      scanList: [],
    }));
    return saved;
  }, [state]);

  const loadCart = useCallback((id: string) => {
    setState((prev) => {
      const saved = prev.savedCarts.find((s) => s.id === id);
      if (!saved) return prev;
      // loading moves the save back into the cart — remove it from the list
      return {
        ...prev,
        cart: saved.items,
        scanList: saved.items.map((i) => i.upc),
        selectedStoreId: saved.storeId,
        selectedVendorId: saved.vendorId,
        shipToJBS: saved.shipToJBS,
        department: saved.department,
        savedCarts: prev.savedCarts.filter((s) => s.id !== id),
      };
    });
  }, []);

  const deleteSavedCart = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      savedCarts: prev.savedCarts.filter((s) => s.id !== id),
    }));
  }, []);

  const generateJOrderId = useCallback(() => {
    // 1. DEPARTMENT (1자리)
    const d = state.department ? state.department.charAt(0).toUpperCase() : 'G';
    
    // 2. VENDOR (2자리) - 공백/특수문자 제거 후 앞 2글자
    const vendor = state.vendors.find((v) => v.id === state.selectedVendorId);
    const v = (vendor?.name || 'XX').replace(/[^A-Z0-9]/ig, '').padEnd(2, 'X').substring(0, 2).toUpperCase();
    
    // 3. STORE (2자리) - 공백/특수문자 제거 후 앞 2글자
    const store = state.stores.find((s) => s.id === state.selectedStoreId);
    const s = (store?.name || 'XX').replace(/[^A-Z0-9]/ig, '').padEnd(2, 'X').substring(0, 2).toUpperCase();
    
    // 4. SHIPTOJBS 여부 (2자리)
    const ship = state.shipToJBS ? 'TR' : 'FA';
    
    // 5. 날짜 MMDD 및 시간 HHMM (총 8자리)
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    
    return `${d}${v}${s}${ship}${mm}${dd}${hh}${min}`;
  }, [state.department, state.vendors, state.selectedVendorId, state.stores, state.selectedStoreId, state.shipToJBS]);

  // ---------- admin CRUD ----------
  const upsertStore = useCallback(
    (s: Store) => {
      setState((prev) => {
        const exists = prev.stores.some((x) => x.id === s.id);
        return {
          ...prev,
          stores: exists
            ? prev.stores.map((x) => (x.id === s.id ? s : x))
            : [...prev.stores, s],
        };
      });
    },
    [],
  );
  const deleteStore = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      stores: prev.stores.filter((s) => s.id !== id),
    }));
  }, []);

  const upsertVendor = useCallback((v: Vendor) => {
    setState((prev) => {
      const exists = prev.vendors.some((x) => x.id === v.id);
      return {
        ...prev,
        vendors: exists
          ? prev.vendors.map((x) => (x.id === v.id ? v : x))
          : [...prev.vendors, v],
      };
    });
  }, []);
  const deleteVendor = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      vendors: prev.vendors.filter((v) => v.id !== id),
    }));
  }, []);

  // update one appearance key locally, then push the whole map to the sheet
  // (debounced so typing a color code doesn't fire a request per keystroke)
  const appearancePushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appearanceDirty = useRef(false);
  const pushAppearance = useCallback(() => {
    if (appearancePushTimer.current) {
      clearTimeout(appearancePushTimer.current);
      appearancePushTimer.current = null;
    }
    if (!appearanceDirty.current) return;
    const url = stateRef.current.settings.appsScriptUrl.trim();
    if (!url) return;
    appearanceDirty.current = false;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ v: APP_BUILD_KEY, action: 'saveAppearance', appearance: stateRef.current.appearance }),
    }).catch(() => {
      appearanceDirty.current = true; // retry on next edit/flush
    });
  }, []);
  const updateAppearance = useCallback((key: string, value: string) => {
    setState((prev) => {
      const next = { ...prev.appearance };
      if (value === '') delete next[key];
      else next[key] = value;
      return { ...prev, appearance: next };
    });
    appearanceDirty.current = true;
    if (appearancePushTimer.current) clearTimeout(appearancePushTimer.current);
    appearancePushTimer.current = setTimeout(pushAppearance, 1500);
  }, [pushAppearance]);

  const updateSettings = useCallback(
    (p: Partial<Settings>) => {
      // login-screen (대문) settings are mirrored into the appearance map so
      // they upload to the sheet and apply on every device after SYNC
      const touched = LOGIN_SYNC_KEYS.filter((k) => k in p);
      setState((prev) => {
        const settings = { ...prev.settings, ...p };
        if (!touched.length) return { ...prev, settings };
        const appearance = { ...prev.appearance };
        for (const k of touched) {
          const v = String((p as any)[k] ?? '');
          if (k === 'loginIconUri') {
            // remove old chunks, then re-chunk (sheet cells cap at 50k chars)
            for (const ak of Object.keys(appearance)) {
              if (ak === ICON_APPEARANCE_KEY || ak.startsWith(ICON_APPEARANCE_KEY + '~')) {
                delete appearance[ak];
              }
            }
            let n = 0;
            do {
              const key = n === 0 ? ICON_APPEARANCE_KEY : `${ICON_APPEARANCE_KEY}~${n + 1}`;
              appearance[key] = v.slice(n * ICON_CHUNK, (n + 1) * ICON_CHUNK);
              n++;
            } while (n * ICON_CHUNK < v.length);
          } else {
            appearance[`login.${k}`] = v; // '' is meaningful (= theme default)
          }
        }
        return { ...prev, settings, appearance };
      });
      if (touched.length) {
        appearanceDirty.current = true;
        if (appearancePushTimer.current) clearTimeout(appearancePushTimer.current);
        appearancePushTimer.current = setTimeout(pushAppearance, 1500);
      }
    },
    [pushAppearance],
  );

//임포트 기능 추가
// 1. 구글 시트 탭 목록 가져오기
const getTabList = async (): Promise<{ ok: boolean; tabs?: string[]; message?: string }> => {
  const url = stateRef.current.settings.appsScriptUrl.trim();
  if (!url) return { ok: false, message: 'Apps Script URL is not configured.' };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ v: APP_BUILD_KEY, action: 'getTabs', userEmail: stateRef.current.session?.email, department: stateRef.current.department }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json().catch(() => ({}));

    if (data && data.ok === false) {
      return { ok: false, message: data.error || 'Failed to fetch tabs' };
    }

    return { ok: true, tabs: data.tabs || [] };
  } catch (e: any) {
    return { ok: false, message: e?.message || 'Network error' };
  }
};

// 2. 선택한 탭 데이터 불러와서 App State(Store, Vendor, Cart)에 주입하기
const importFromSheet = async (tabName: string): Promise<{ ok: boolean; message?: string }> => {
  const url = stateRef.current.settings.appsScriptUrl.trim();
  if (!url) return { ok: false, message: 'Apps Script URL is not configured.' };

  try {
    // [1단계] 서버에 데이터 요청 (이때 서버는 탭을 지우지 않고 데이터만 반환합니다)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ v: APP_BUILD_KEY, action: 'import', tabName, userEmail: stateRef.current.session?.email, department: stateRef.current.department }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json().catch(() => ({}));

    if (data && data.ok === false) {
      return { ok: false, message: data.error || 'Failed to import sheet data' };
    }

    // --- 수신 데이터로 앱 상태(State) 복원 ---
    let targetVendorId = stateRef.current.selectedVendorId;
    
    // 1. Store 매칭 및 설정
    if (data.store) {
      const matchedStore = stateRef.current.stores.find(
        (s) => s.name.trim().toLowerCase() === String(data.store).trim().toLowerCase()
      );
      if (matchedStore) setSelectedStoreId(matchedStore.id);
    }

    // 2. Vendor 매칭 및 설정
    if (data.vendor) {
      const matchedVendor = stateRef.current.vendors.find(
        (v) => v.name.trim().toLowerCase() === String(data.vendor).trim().toLowerCase()
      );
      if (matchedVendor) {
        setSelectedVendorId(matchedVendor.id);
        targetVendorId = matchedVendor.id;
      }
    }

    // 3. Ship to JBS 설정
    if (typeof data.shipToJBS === 'boolean') {
      setShipToJBS(data.shipToJBS);
    }

    // 4. Cart 아이템 복원 ({ upc, qty, opt } 구조)
    if (Array.isArray(data.items)) {
      const newOptions: Record<string, string> = {}; // 서버에서 온 옵션들을 모아둘 객체

      const newCart = data.items
        .filter((item: any) => item.upc && item.qty > 0)
        .map((item: any) => {
          const upcStr = String(item.upc);
          const optStr = item.opt ? String(item.opt) : undefined;
          
          // 가져온 옵션 값이 있다면 newOptions에 기록
          if (optStr) {
            newOptions[upcStr] = optStr;
          }

          return {
            upc: upcStr,
            qty: Number(item.qty),
            vendorId: targetVendorId || '',
            opt: optStr, 
          };
        });

      // 1. 장바구니(Cart) 상태 업데이트
      patch({ cart: newCart });

      // 2. 앱 전역 옵션(selectedOptions) 상태에 일괄 적용시켜 ItemCard 등 UI에 반영
      if (Object.keys(newOptions).length > 0) {
        setSelectedOptions((prev) => ({ ...prev, ...newOptions }));
      }
    }

    // [2단계] 클라이언트에 데이터가 무사히 적재되었으므로 서버에 탭 삭제 요청 (2-Step 삭제)
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ v: APP_BUILD_KEY, action: 'deleteTab', tabName, department: stateRef.current.department }),
      });
    } catch (delErr) {
      console.warn('Failed to delete tab on server after import:', delErr);
      // 삭제 네트워크 에러가 나더라도 데이터 불러오기는 이미 성공했으므로 에러 처리하지 않음
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e?.message || 'Network error' };
  }
};
  // 임포트 추가 끝

  
  // flush pending appearance edits when the app goes to background
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s !== 'active') pushAppearance();
    });
    return () => sub.remove();
  }, [pushAppearance]);

  // Pull stores / vendors / products from the Google Sheet via Apps Script.
  // Expected GET response JSON:
  // { stores:[{name,address}], vendors:[{name,salesPerson,email,map:{upcCol,upcCol2,codeCol,descCol,costCol,imageCol}}],
  //   products:[{upc,itemCode,description,cost,vendor,imageUrl}] }
  // 전체 동기화가 적용된 횟수 — 벤더 단건 동기화의 낡은 응답이 덮어쓰지 못하게 하는 기준
  const fullSyncCountRef = useRef(0);
  const syncFromSheets = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    const url = state.settings.appsScriptUrl.trim();
    if (!url) return { ok: false, message: 'Apps Script URL is not set' };
    // 벤더 선택 시 동기화 모드에서는 상품을 제외한 가벼운 동기화만 수행
    const light = state.settings.syncMode === 'vendor';
    try {
      const res = await fetch(
        `${url}${url.includes('?') ? '&' : '?'}action=data${light ? '&scope=light' : ''}&v=${APP_BUILD_KEY}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      if (data.error === 'UPDATE_REQUIRED') {
        Alert.alert('Update Required 업데이트 필요', `${data.message || 'Please update to the latest version'}\n\nTap JENNY on the top left to update.`);
        return { ok: false, message: data.message };
      }
      const updates: Partial<AppState> = { lastSyncAt: new Date().toISOString() };

      // 강제 로그아웃 : epoch 바뀌면 세션 종료
      const remoteEpoch = String(data.sessionEpoch ?? '');
      if (remoteEpoch) {
        updates.sessionEpoch = remoteEpoch;
        if (state.sessionEpoch && state.sessionEpoch !== remoteEpoch && state.session) {
          updates.session = null;
        }
      }

      let vendors: Vendor[] | undefined;
      if (Array.isArray(data.vendors) && data.vendors.length > 0) {
        vendors = data.vendors.map((v: any, i: number) => ({
          id: String(v.name ?? `vendor-${i}`).toUpperCase(),
          name: String(v.name ?? '').toUpperCase(),
          salesPerson: String(v.salesPerson ?? ''),
          email: String(v.email ?? ''),
          qtyStep: Math.max(1, Math.floor(Number(v.qtyStep) || 1)),
          map: {
            upcCol: String(v.map?.upcCol ?? ''),
            upcCol2: v.map?.upcCol2 ? String(v.map.upcCol2) : undefined,
            codeCol: String(v.map?.codeCol ?? ''),
            descCol: String(v.map?.descCol ?? ''),
            costCol: String(v.map?.costCol ?? ''),
            imageCol: v.map?.imageCol ? String(v.map.imageCol) : undefined,
          },
        }));
        updates.vendors = vendors;
      }
      if (Array.isArray(data.stores) && data.stores.length > 0) {
        updates.stores = data.stores.map((s: any, i: number) => ({
          id: String(s.name ?? `store-${i}`).toUpperCase(),
          name: String(s.name ?? '').toUpperCase(),
          address: String(s.address ?? ''),
        }));
      }
      if (Array.isArray(data.products) && data.products.length > 0) {
        const vlist = vendors ?? state.vendors;
        updates.products = data.products
          .map((p: any) => {
            const vendorName = String(p.vendor ?? '').toUpperCase();
            const vendor = vlist.find((v) => v.name === vendorName);
            return {
              upc: String(p.upc ?? ''),
              itemCode: String(p.itemCode ?? ''),
              description: String(p.description ?? ''),
              cost: String(p.cost ?? '0'),
              vendorId: vendor?.id ?? vendorName,
              imageUrl: p.imageUrl ? String(p.imageUrl) : undefined,
            };
          })
          .filter((p: Product) => p.upc);
      }
      const emailSynced = Boolean(
        data.emailTemplate && (data.emailTemplate.title || data.emailTemplate.body),
      );
      // apply remote appearance (empty map included — tab exists but cleared)
      let loginPatch: Partial<Settings> = {};
      if (
        data.appearance && typeof data.appearance === 'object' && !Array.isArray(data.appearance)
      ) {
        const map: Record<string, string> = {};
        for (const [k, v] of Object.entries(data.appearance)) map[k] = String(v ?? '');
        updates.appearance = map;

        // login (대문) settings shared by the admin — apply on every device
        for (const k of LOGIN_SYNC_KEYS) {
          if (k === 'loginIconUri') {
            if (ICON_APPEARANCE_KEY in map) {
              let icon = map[ICON_APPEARANCE_KEY];
              for (let n = 2; map[`${ICON_APPEARANCE_KEY}~${n}`] !== undefined; n++) {
                icon += map[`${ICON_APPEARANCE_KEY}~${n}`];
              }
              loginPatch.loginIconUri = icon;
            }
          } else if (`login.${k}` in map) {
            const v = map[`login.${k}`];
            // syncMode는 유효한 값일 때만 적용 (빈 값/오타로 깨지지 않게)
            if (k === 'syncMode' && v !== 'all' && v !== 'vendor') continue;
            (loginPatch as any)[k] = v;
          }
        }

        // 시트에서 가져온 global.theme 또는 login.theme이 존재하는 경우 테마 설정에 적용
        if (map['global.theme']) {
          loginPatch.theme = map['global.theme'];
        } else if (map['login.theme']) {
          loginPatch.theme = map['login.theme'];
        }
      }
      setState((prev) => ({
        ...prev,
        ...updates,
        // merge email template into the *latest* settings to avoid stale overwrites
        settings: {
          ...prev.settings,
          ...loginPatch,
          ...(emailSynced && data.emailTemplate.title ? { emailTitle: String(data.emailTemplate.title) } : {}),
          ...(emailSynced && data.emailTemplate.body ? { emailBody: String(data.emailTemplate.body) } : {}),
        },
      }));
      
      if (updates.products) {
        fullSyncCountRef.current += 1; // 상품 전체가 갱신됨
        // [Track 2] 백그라운드로 로컬 파일 시스템에 상품 전체 저장
        FileSystem.writeAsStringAsync(PRODUCTS_FILE_URI, JSON.stringify(updates.products)).catch((err) =>
          console.warn('Failed to write products to file system', err)
        );
      }
      const counts = [
        updates.stores ? `${updates.stores.length} stores` : null,
        updates.vendors ? `${updates.vendors.length} vendors` : null,
        updates.products ? `${updates.products.length} products` : null,
        emailSynced ? 'email template' : null,
      ].filter(Boolean);
      return {
        ok: true,
        message: counts.length ? `Synced: ${counts.join(', ')}` : 'Connected, but no data returned',
      };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? 'Sync failed' };
    }
  }, [state.settings.appsScriptUrl, state.settings.syncMode, state.vendors, state.sessionEpoch, state.session]);

  /** 벤더 한 곳의 상품만 받아와 그 벤더 상품을 교체 (벤더 선택 시 동기화 모드) */
  const syncingVendorsRef = useRef<Set<string>>(new Set());
  const syncVendorProducts = useCallback(
    async (vendorId: string): Promise<{ ok: boolean; message: string }> => {
      const cur = stateRef.current;
      const url = cur.settings.appsScriptUrl.trim();
      if (!url) return { ok: false, message: 'Apps Script URL is not set' };
      const vendor = cur.vendors.find((v) => v.id === vendorId);
      if (!vendor) return { ok: false, message: 'Unknown vendor' };
      if (syncingVendorsRef.current.has(vendorId)) return { ok: true, message: 'Already syncing' };
      syncingVendorsRef.current.add(vendorId);
      // 전체 동기화와의 경합 방지: 요청 시작 후 전체 동기화가 끝났으면 이 응답은 버림
      const fullSyncAtStart = fullSyncCountRef.current;
      try {
        const res = await fetch(
          `${url}${url.includes('?') ? '&' : '?'}action=data&vendor=${encodeURIComponent(vendor.name)}&v=${APP_BUILD_KEY}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        if (data.error === 'UPDATE_REQUIRED') {
          Alert.alert('Update Required 업데이트 필요', `${data.message || 'Please update to the latest version'}\n\nTap JENNY on the top left to update.`);
          return { ok: false, message: data.message };
        }
        // 강제 로그아웃 신호는 벤더 단건 동기화에서도 동일하게 처리
        const remoteEpoch = String(data.sessionEpoch ?? '');
        if (remoteEpoch) {
          setState((prev) => ({
            ...prev,
            sessionEpoch: remoteEpoch,
            session:
              prev.sessionEpoch && prev.sessionEpoch !== remoteEpoch ? null : prev.session,
          }));
        }
        if (fullSyncCountRef.current !== fullSyncAtStart) {
          return { ok: true, message: 'Skipped (newer full sync applied)' };
        }
        if (!Array.isArray(data.products)) return { ok: false, message: 'No data returned' };
        const fresh: Product[] = data.products
          .map((p: any) => ({
            upc: String(p.upc ?? ''),
            itemCode: String(p.itemCode ?? ''),
            description: String(p.description ?? ''),
            cost: String(p.cost ?? '0'),
            vendorId,
            imageUrl: p.imageUrl ? String(p.imageUrl) : undefined,
          }))
          .filter((p: Product) => p.upc);
        // 빈 결과면 기존 캐시 유지 (탭 이름 불일치 등으로 캐시를 날리지 않도록)
        if (fresh.length === 0) return { ok: false, message: 'No products for this vendor' };
        
        setState((prev) => {
          const nextProducts = [...prev.products.filter((p) => p.vendorId !== vendorId), ...fresh];
          
          // [Track 2] 백그라운드로 로컬 파일 시스템에 변경된 상품 목록 덮어쓰기
          FileSystem.writeAsStringAsync(PRODUCTS_FILE_URI, JSON.stringify(nextProducts)).catch((err) =>
            console.warn('Failed to write vendor products to file system', err)
          );

          return {
            ...prev,
            products: nextProducts,
            lastSyncAt: new Date().toISOString(),
          };
        });
        
        return { ok: true, message: `Synced ${fresh.length} products (${vendor.name})` };
      } catch (e: any) {
        return { ok: false, message: e?.message ?? 'Sync failed' };
      } finally {
        syncingVendorsRef.current.delete(vendorId);
      }
    },
    [],
  );
  const syncVendorProductsRef = useRef(syncVendorProducts);
  syncVendorProductsRef.current = syncVendorProducts;

  // 전원 강제 로그아웃: 시트의 epoch를 갱신, joon만 유지
  const forceLogoutAll = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    const url = state.settings.appsScriptUrl.trim();
    if (!url) return { ok: false, message: 'Apps Script URL is not set' };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ v: APP_BUILD_KEY, action: 'forceLogout' }),
      });
      const data = await res.json();
      if (!data.ok || !data.epoch) return { ok: false, message: data.error ?? 'Failed' };
      patch({ sessionEpoch: String(data.epoch) }); // 본인 기기는 새 epoch를 미리 기록해 로그아웃 제외
      return { ok: true, message: 'All devices will be signed out on their next sync.' };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? 'Failed' };
    }
  }, [state.settings.appsScriptUrl, patch]);

  // Auto-sync on app start: once the saved state is loaded, if an Apps Script
  // URL is configured, pull the latest data in the background.
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (loading || autoSyncedRef.current) return;
    autoSyncedRef.current = true;
    if (!state.settings.appsScriptUrl.trim()) return;
    syncFromSheets().catch(() => {});
  }, [loading, state.settings.appsScriptUrl, syncFromSheets]);

  // Re-sync when the app returns from background, if the last sync is stale.
  // Cooldown prevents rapid background/active flips from spamming the server.
  const RESYNC_AFTER_MS = 60 * 60 * 1000; // 1 hour
  const syncFromSheetsRef = useRef(syncFromSheets);
  syncFromSheetsRef.current = syncFromSheets;
  const resyncingRef = useRef(false);
  useEffect(() => {
    if (loading) return;
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s !== 'active' || resyncingRef.current) return;
      const cur = stateRef.current;
      if (!cur.settings.appsScriptUrl.trim()) return;
      const last = cur.lastSyncAt ? Date.parse(cur.lastSyncAt) : 0;
      if (Number.isFinite(last) && Date.now() - last < RESYNC_AFTER_MS) return;
      resyncingRef.current = true;
      syncFromSheetsRef.current()
        .catch(() => {})
        .finally(() => {
          resyncingRef.current = false;
        });
    });
    return () => sub.remove();
  }, [loading]);

  const value: AppContextValue = {
    ...state,
    purchaseAccess,
    refreshPurchaseAccess,
    appVersion: APP_BUILD_KEY,
    loading,
    login,
    loginWithGoogle,
    verifyPin,
    logout,
    approveUser,
    requestAccess,
    refreshRemoteUsers,
    checkApproval,
    removeUser,
    resetDevice,
    setUserRole,
    setSelectedStoreId,
    setSelectedVendorId,
    setShipToJBS,
    setDepartment,
    addToScanList: (upc) => {
      if (isSevenDollarWorkLocked()) return;
      addToScanList(upc);
    },
    removeFromScanList: (upc, opt) => {
      if (isSevenDollarWorkLocked()) return;
      removeFromScanList(upc, opt);
    },
    setQty: (upc, qty, opt) => {
      if (isSevenDollarWorkLocked()) return;
      setQty(upc, qty, opt);
    },
    clearCart,
    cartTotal,
    qtyOf,
    relatedItems: (product) => {
      if (isSevenDollarWorkLocked()) return [];
      return relatedItems(product);
    },
    findAllByUpc: (upc) => {
      if (isSevenDollarWorkLocked()) return [];
      return findAllByUpc(upc);
    },
    findByUpc: (upc) => {
      if (isSevenDollarWorkLocked()) return undefined;
      return findByUpc(upc);
    },
    searchProducts: (kw) => {
      if (isSevenDollarWorkLocked()) return [];
      return searchProducts(kw);
    },
    isProductOutOfStock,
    saveCart,
    loadCart,
    deleteSavedCart,
    upsertStore,
    deleteStore,
    upsertVendor,
    deleteVendor,
    updateSettings,
    updateAppearance,
    syncFromSheets,
    syncVendorProducts,
    forceLogoutAll,
    genId,
    itemOptionOf,
    setItemOption,
    toggleHaptic,
    generateJOrderId,
  };

  return (
    <AppContext.Provider value={{ ...value, getTabList, importFromSheet }}>
      <View
        style={{ flex: 1 }}
        pointerEvents={sevenDollarWorkLocked ? 'none' : 'auto'}
        accessibilityElementsHidden={sevenDollarWorkLocked}
        importantForAccessibility={
          sevenDollarWorkLocked ? 'no-hide-descendants' : 'auto'
        }
        {...(Platform.OS === 'web' && sevenDollarWorkLocked
          ? ({ inert: '' } as any)
          : {})}
      >
        {children}
      </View>

      <Modal
        visible={sevenDollarWorkLocked}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          {sevenDollarOosStatus === 'failed' ? (
            <View
              accessibilityViewIsModal
              style={{
                width: '100%',
                maxWidth: 380,
                backgroundColor: '#FFFFFF',
                borderRadius: 14,
                padding: 20,
              }}
            >
              <Text
                accessibilityRole="header"
                style={{
                  color: '#111111',
                  fontSize: 17,
                  fontWeight: '700',
                  textAlign: 'center',
                  marginBottom: 22,
                }}
              >
                {'FAILED TO RETRIEVE\nFULL OUT OF STOCK LIST'}
              </Text>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'stretch',
                  gap: 10,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  onPress={retrySevenDollarOos}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 48,
                    borderRadius: 8,
                    backgroundColor: '#EEEEEE',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 8,
                    paddingVertical: 12,
                    opacity: pressed ? 0.5 : 1,
                  })}
                >
                  <Text
                    style={{
                      color: '#111111',
                      fontSize: 13,
                      fontWeight: '700',
                      textAlign: 'center',
                    }}
                  >
                    RETRY
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={continueWithoutSevenDollarOos}
                  style={({ pressed }) => ({
                    flex: 2,
                    minHeight: 48,
                    borderRadius: 8,
                    backgroundColor: '#EEEEEE',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 8,
                    paddingVertical: 12,
                    opacity: pressed ? 0.5 : 1,
                  })}
                >
                  <Text
                    style={{
                      color: '#111111',
                      fontSize: 13,
                      fontWeight: '700',
                      textAlign: 'center',
                    }}
                  >
                    CONTINUE WITHOUT
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <ActivityIndicator size="large" color="#FFFFFF" />
          )}
        </View>
      </Modal>
    </AppContext.Provider>
  );
}

export function useOptionalApp(): AppContextValue | null {
  return useContext(AppContext);
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function useFontScale(): number {
  const { settings } = useApp();
  return settings.fontScale === 'small' ? 0.9 : settings.fontScale === 'large' ? 1.15 : 1;
}