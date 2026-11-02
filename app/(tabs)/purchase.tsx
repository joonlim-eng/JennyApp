import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, useFocusEffect } from 'expo-router';
import { Feather } from '@/components/AppIcon';
import { APP_BUILD_KEY, useApp, useFontScale } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type Department = 'GM' | 'PRODUCT';

const PURCHASE_STORES = [
  'ARLINGTON',
  'CARROLLTON',
  'DALLAS',
  'DESOTO',
  'HOUSTON',
  'IRVING',
  'LEWISVILLE',
  'MANSFIELD',
  'MEADOW',
  'MESQUITE',
  'JBS',
] as const;
// TOTAL view: only these accounts. Always the first item in dropdown / cycle.
const TOTAL_STORE = 'TOTAL'; // Internal key; displayed as OVERVIEW.
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;
const TOTAL_VIEW_EMAILS: readonly string[] = ['samhong@jennybs.com', 'joonlim@jennybs.com'];
// Rows shown in the TOTAL table (JBS excluded).
const TOTAL_ROW_STORES: readonly string[] = PURCHASE_STORES.filter((s) => s !== 'JBS');
// Neutral two-letter store marks in the OVERVIEW list (MESQUITE = MQ).
const STORE_MARKS: Record<string, string> = {
  ARLINGTON: 'AR', CARROLLTON: 'CR', DALLAS: 'DA', DESOTO: 'DS',
  HOUSTON: 'HO', IRVING: 'IR', LEWISVILLE: 'LE', MANSFIELD: 'MA',
  MEADOW: 'ME', MESQUITE: 'MQ',
};
type StoreSummary = {
  name: string;
  spent: number | null;
  budget: number | null;
  invoiced: number | null;
  processing: number | null;
};
type PurchaseOrder = {
  id: string;
  store: string;
  date: string;
  vendor: string;
  po: string;
  poUrl: string;
  invoice: string;
  invoiceUrl: string;
  total: number;
  invoiceIssued: boolean;
};
type WmsInvoice = {
  invoiceNumber: string;
  vendor?: string | null;
  type?: string | null;
  status?: string | null;
  assignedStoreName?: string | null;
  receivedDate?: string | null;
  completedDate?: string | null;
  dispatchedAt?: string | null;
  droppedAt?: string | null;
  deliveredAt?: string | null;
  createdAt?: string | null;
  totalBoxCount?: number | null;
};
type WmsResponse = {
  ok: boolean;
  invoices?: WmsInvoice[];
};

type PurchaseResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  configured?: boolean;
  month?: string;
  year?: number;
  sheetName?: string;
  department?: Department;
  stores?: StoreSummary[];
  cards?: PurchaseOrder[];
};

const money = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value)
    ? '—'
    : `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const count = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? '—' : String(value);

// Plain amount string without "$" (used for the small SPENT / BUDGET line).
const plain = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value)
    ? '—'
    : `${value < 0 ? '-' : ''}${Math.abs(value).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

// Amount without "$", cents same size, tabular digits. Colors come from the theme only.
function MoneyText({
  value,
  size,
  color,
  weight = 'bold',
  style,
}: {
  value: number | null | undefined;
  size: number;
  color: string;
  weight?: 'bold' | 'regular';
  style?: React.ComponentProps<typeof Text>['style'];
}) {
  const base = {
    color,
    fontSize: size,
    fontFamily: weight === 'bold' ? 'Inter_700Bold' : 'Inter_500Medium',
    fontVariant: ['tabular-nums' as const],
  };
  if (value == null || !Number.isFinite(value)) {
    return <Text style={[base, style]} numberOfLines={1}>—</Text>;
  }
  const text = `${value < 0 ? '-' : ''}${Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  return (
    <Text style={[base, style]} numberOfLines={1} adjustsFontSizeToFit>
      {text}
    </Text>
  );
}

// OVERVIEW palette: derive readable text from the current app primary color.
type RGBColor = { r: number; g: number; b: number };
const limit = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const rgbHex = ({ r, g, b }: RGBColor) =>
  `#${[r, g, b].map((v) => Math.round(limit(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`;

const parseRgb = (value: string): RGBColor | null => {
  const input = value.trim();
  if (/^#[\da-f]{3,4}$/i.test(input)) {
    return { r: parseInt(input[1] + input[1], 16), g: parseInt(input[2] + input[2], 16), b: parseInt(input[3] + input[3], 16) };
  }
  if (/^#[\da-f]{6}([\da-f]{2})?$/i.test(input)) {
    return { r: parseInt(input.slice(1, 3), 16), g: parseInt(input.slice(3, 5), 16), b: parseInt(input.slice(5, 7), 16) };
  }
  const rgb = input.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*[\d.]+)?\s*\)$/i);
  if (rgb) return { r: limit(+rgb[1], 0, 255), g: limit(+rgb[2], 0, 255), b: limit(+rgb[3], 0, 255) };
  return null;
};
const blendRgb = (start: RGBColor, end: RGBColor, amount: number): RGBColor => ({
  r: start.r + (end.r - start.r) * amount,
  g: start.g + (end.g - start.g) * amount,
  b: start.b + (end.b - start.b) * amount,
});
const WHITE: RGBColor = { r: 255, g: 255, b: 255 };
const INK: RGBColor = { r: 17, g: 25, b: 40 };
const relativeLuminance = ({ r, g, b }: RGBColor): number => {
  const convert = (component: number) => {
    const channel = component / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * convert(r) + 0.7152 * convert(g) + 0.0722 * convert(b);
};
const contrastRatio = (one: RGBColor, two: RGBColor) => {
  const first = relativeLuminance(one);
  const second = relativeLuminance(two);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
};
const readableInk = (background: RGBColor): RGBColor => {
  if (contrastRatio(WHITE, background) >= 4.5) return WHITE;
  if (contrastRatio(INK, background) >= 4.5) return INK;
  return { r: 0, g: 0, b: 0 }; // Handles the narrow mid-gray range safely.
};

const overviewTheme = (primaryColor: string, surfaceColor: string) => {
  // Native theme tokens normally use #RGB/#RRGGBB; RGB is supported too.
  const primary = parseRgb(primaryColor) ?? INK;
  const surface = parseRgb(surfaceColor) ?? WHITE;
  const summaryText = readableInk(primary);
  const pillText = readableInk(surface);
  const greenChoices = ['#128339', '#08752b', '#4ede83', '#9cf4af']
    .map((color) => parseRgb(color)!).filter((color) => contrastRatio(color, surface) >= 4.5);
  const green = greenChoices[0] ?? pillText;
  return {
    card: rgbHex(primary),
    text: rgbHex(summaryText),
    divider: rgbHex(blendRgb(primary, summaryText, 0.40)),
    glow: rgbHex(summaryText),
    pill: surfaceColor,
    pillText: rgbHex(pillText),
    pillDivider: rgbHex(blendRgb(surface, pillText, 0.19)),
    remainingGreen: rgbHex(green),
  };
};

// Keep warehouse status text independent from the purchase-sheet invoice link label.
const wmsInvoiceKey = (s: string) => String(s || '').trim().toUpperCase();
const wmsStatusLabel = (s: string) => ({
  '입고': 'RECEIVED',
  '작업중': 'IN PROGRESS',
  '발송대기': 'READY TO SHIP',
} as Record<string, string>)[s] || s.replace(/_/g, ' ').toUpperCase();

const wmsDate = (value: string | null | undefined): string => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value.slice(5, 7)}/${value.slice(8, 10)}/${value.slice(0, 4)}`;
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(parsed);
  } catch { return ''; }
};
const wmsTime = (value: string | null | undefined): string => {
  if (!value || !value.includes('T')) return '';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(parsed);
  } catch { return ''; }
};
const wmsStatusDate = (item: WmsInvoice): string => {
  const value = item.status?.trim().toUpperCase();
  if (value === 'SENT') return wmsDate(item.dispatchedAt);
  if (value === 'DROPPED') return wmsDate(item.droppedAt);
  if (value === '발송대기' || value === 'READY TO SHIP') return wmsDate(item.completedDate);
  if (value === '입고' || value === 'RECEIVED') return wmsDate(item.receivedDate);
  return '';
};

const WMS_DATED_STEPS: { field: keyof WmsInvoice; label: string }[] = [
  { field: 'receivedDate', label: 'RECEIVED' },
  { field: 'completedDate', label: 'WORK COMPLETED' },
  { field: 'dispatchedAt', label: 'SENT' },
  { field: 'droppedAt', label: 'DROPPED' },
  { field: 'deliveredAt', label: 'DELIVERED' },
];

export default function PurchaseScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const fs = useFontScale();
  const { session, settings, purchaseAccess } = useApp();
  const isMaster = session?.role === 'master';

  const allowedDepartments: Department[] = isMaster
  ? ['GM', 'PRODUCT']
  : purchaseAccess != null &&
    !!session?.email &&
    purchaseAccess.email === session.email.trim().toLowerCase()
    ? purchaseAccess.departments
    : [];

  const allowed = isMaster || (session?.role === 'admin' &&
  allowedDepartments.length > 0 && !!purchaseAccess?.stores.length);
  const canViewTotal = allowed &&
    TOTAL_VIEW_EMAILS.includes(session?.email?.trim().toLowerCase() ?? '');
  const allowedStores = useMemo<string[]>(() => {
    let stores: string[];
    if (isMaster) stores = [...PURCHASE_STORES];
    else if (!allowed || !purchaseAccess) stores = [];
    else stores = purchaseAccess.stores.includes('ALL')
      ? [...PURCHASE_STORES]
      : purchaseAccess.stores;
    return canViewTotal && stores.length ? [TOTAL_STORE, ...stores] : stores;
  }, [isMaster, allowed, purchaseAccess, canViewTotal]);

  const [department, setDepartment] = useState<Department>('GM');
  const [storeName, setStoreName] = useState<string>(() =>
    canViewTotal ? TOTAL_STORE : 'LEWISVILLE');

  // TOTAL accounts open on TOTAL once (also when access arrives after mount).
  const totalDefaultAppliedRef = useRef(false);
  useEffect(() => {
    if (canViewTotal && !totalDefaultAppliedRef.current) {
      totalDefaultAppliedRef.current = true;
      setStoreName(TOTAL_STORE);
    }
  }, [canViewTotal]);
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    const today = new Date();
    return { month: today.getMonth(), year: today.getFullYear() };
  });
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const [result, setResult] = useState<PurchaseResponse | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [wmsResponse, setWmsResponse] = useState<{
    key: string;
    invoices: WmsInvoice[];
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // Android back closes the in-place order detail, not the PURCHASE route.
  // Register only while PURCHASE is focused and a detail is open.
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== 'android' || !selectedOrder) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelectedOrder(null);
      return true; // Consume this press so the navigator cannot leave PURCHASE.
    });
    return () => subscription.remove();
  }, [selectedOrder]));

  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [storeName]);

  // A single permitted department cannot be switched to another department.
  const effectiveDepartment: Department = allowedDepartments.includes(department)
    ? department : (allowedDepartments[0] ?? 'GM');
  const selectedMonthName = MONTH_NAMES[selectedPeriod.month];
  const targetTabName = `${selectedMonthName} ${effectiveDepartment === 'GM' ? 'GM' : 'PD'}`;
  const nextMonth = useCallback(() => {
    setResult(null);
    setSelectedPeriod(({ month, year }) => month === 11
      ? { month: 0, year: year + 1 }
      : { month: month + 1, year });
  }, []);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // If H changes, immediately remove any store that is no longer permitted.
  useEffect(() => {
    setStoreName((previous) => allowedStores.includes(previous)
      ? previous : (allowedStores[0] ?? ''));
    if (!allowedStores.length) setStorePickerOpen(false);
  }, [allowedStores]);

  // Both the title and the dropdown use the same H-authorized store list.
  const nextStore = useCallback(() => {
    if (allowedStores.length < 2) return;
    setStoreName((previous) => {
      const index = allowedStores.indexOf(previous);
      return allowedStores[(index + 1) % allowedStores.length];
    });
  }, [allowedStores]);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    const load = async () => {
      const base = settings.appsScriptUrl.trim();
      if (!base) {
        setFailure('Apps Script URL is not configured.');
        setResult(null);
        return;
      }
      if (!session?.purchaseToken) {
        setFailure('Purchase session unavailable.');
        setResult(null);
        return;
      }
      setLoading(true);
      setFailure('');
      try {
        const params = [
          `action=purchase`,
          `department=${encodeURIComponent(effectiveDepartment)}`,
          `month=${encodeURIComponent(selectedMonthName)}`,
          `year=${encodeURIComponent(selectedPeriod.year)}`,
          `sheetName=${encodeURIComponent(targetTabName)}`,
          `token=${encodeURIComponent(session.purchaseToken)}`,
          `v=${encodeURIComponent(APP_BUILD_KEY)}`,
        ].join('&');
        const response = await fetch(`${base}${base.includes('?') ? '&' : '?'}${params}`);
        if (!response.ok) throw new Error(`Server returned HTTP ${response.status}.`);
        const json = (await response.json()) as PurchaseResponse;
        if (!json.ok) {
          // Keep authentication errors concise; do not show sign-out/sign-in instructions.
          const message = json.error === 'PURCHASE_LOGIN_REQUIRED'
            ? 'Purchase session unavailable.'
            : (json.message || json.error || 'Unable to load purchases.');
          throw new Error(message);
        }
        // Never display another tab/year as if it were the selected period.
        // Apps Script must return the actual source sheetName and year.
        if (json.configured !== false &&
            (json.sheetName?.trim().toUpperCase() !== targetTabName.toUpperCase() || json.year !== selectedPeriod.year)) {
          throw new Error(`Purchase source not confirmed: ${targetTabName} (${selectedPeriod.year}).`);
        }
        if (active) setResult(json);
      } catch (err) {
        if (active) {
          setResult(null);
          setFailure(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [allowed, effectiveDepartment, selectedMonthName, selectedPeriod.year,
      targetTabName, refreshKey, session?.purchaseToken, settings.appsScriptUrl]);


  // Independent read: a warehouse outage never blocks PURCHASE budgets/cards.
  const wmsScopeKey = `${effectiveDepartment}:${selectedPeriod.year}:${selectedMonthName}`;
  useEffect(() => {
    let active = true;
    setWmsResponse(null);
    const base = settings.appsScriptUrl.trim();
    if (!allowed || !base || !session?.purchaseToken) return () => { active = false; };
    const loadWms = async () => {
      try {
        const params = [
          'action=purchaseWms',
          `department=${encodeURIComponent(effectiveDepartment)}`,
          `month=${encodeURIComponent(selectedMonthName)}`,
          `year=${encodeURIComponent(selectedPeriod.year)}`,
          `token=${encodeURIComponent(session.purchaseToken || '')}`,
          `v=${encodeURIComponent(APP_BUILD_KEY)}`,
        ].join('&');
        const response = await fetch(`${base}${base.includes('?') ? '&' : '?'}${params}`);
        if (!response.ok) return;
        const json = (await response.json()) as WmsResponse;
        if (active && json.ok && Array.isArray(json.invoices)) {
          setWmsResponse({ key: wmsScopeKey, invoices: json.invoices });
        }
      } catch {
        // No placeholder status/date is displayed on a failed WMS lookup.
      }
    };
    void loadWms();
    return () => { active = false; };
  }, [allowed, effectiveDepartment, selectedMonthName, selectedPeriod.year,
      session?.purchaseToken, settings.appsScriptUrl, refreshKey, wmsScopeKey]);

  const wmsByInvoice = useMemo(() => {
    const map: Record<string, WmsInvoice> = {};
    if (wmsResponse?.key === wmsScopeKey) {
      wmsResponse.invoices.forEach((item) => {
        if (item?.invoiceNumber) map[wmsInvoiceKey(item.invoiceNumber)] = item;
      });
    }
    return map;
  }, [wmsResponse, wmsScopeKey]);
  const wmsForOrder = (order: PurchaseOrder): WmsInvoice | null => {
    const key = wmsInvoiceKey(order.invoice);
    return wmsByInvoice[key] ||
      (key.startsWith('JBS ') ? wmsByInvoice[key.slice(4).trim()] : null) || null;
  };

  const currentStore = useMemo(
    () => result?.stores?.find((s) => s.name.trim().toUpperCase() === storeName) ?? null,
    [result, storeName],
  );
  const storeOrders = useMemo(
    () => (result?.cards ?? []).filter((order) => order.store.trim().toUpperCase() === storeName),
    [result, storeName],
  );
  const issued = useMemo(() => storeOrders.filter((o) => o.invoiceIssued), [storeOrders]);
  const missing = useMemo(() => storeOrders.filter((o) => !o.invoiceIssued), [storeOrders]);
  const remaining = currentStore?.budget != null && currentStore.spent != null
    ? currentStore.budget - currentStore.spent
    : null;

  // TOTAL view reuses the same stores[].budget (AQ:BJ) and stores[].spent (M).
  const isTotal = storeName === TOTAL_STORE;
  const totalRows = useMemo(() => TOTAL_ROW_STORES.map((name) => {
    const s = result?.stores?.find((x) => x.name.trim().toUpperCase() === name) ?? null;
    const budget = s?.budget ?? null;
    const spent = s?.spent ?? null;
    return {
      name,
      budget,
      spent,
      remaining: budget != null && spent != null ? budget - spent : null,
    };
  }), [result]);
  const totalSum = useMemo(() => {
    const sum = (key: 'budget' | 'spent' | 'remaining') => {
      const values = totalRows
        .map((r) => r[key])
        .filter((v): v is number => v != null && Number.isFinite(v));
      return values.length ? values.reduce((a, b) => a + b, 0) : null;
    };
    return { budget: sum('budget'), spent: sum('spent'), remaining: sum('remaining') };
  }, [totalRows]);
  const overviewPalette = useMemo(
    () => overviewTheme(colors.primary, colors.card),
    [colors.primary, colors.card],
  );
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const openLink = async (url: string) => {
    if (!/^https?:\/\//i.test(url)) return;
    try { await Linking.openURL(url); }
    catch { setFailure('Could not open the linked document.'); }
  };

  const renderOrder = (order: PurchaseOrder) => {
    const wms = wmsForOrder(order);
    const status = wms?.status?.trim();
    const statusDate = wms ? wmsStatusDate(wms) : '';
    return (
      <Pressable
        key={order.id}
        onPress={() => setSelectedOrder(order)}
        accessibilityRole="button"
        accessibilityLabel={`${order.vendor}, invoice ${order.invoice || 'not issued'}, details`}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.cardTitleRow}>
          <View style={styles.vendorDateRow}>
            <Text style={[styles.vendor, { color: colors.foreground, fontSize: 15 * fs }]} numberOfLines={1}>
              {order.vendor}
            </Text>
            {!!order.date && (
              <Text style={[styles.date, { color: colors.mutedForeground, fontSize: 12 * fs }]} numberOfLines={1}>
                {order.date}
              </Text>
            )}
          </View>
          <Text style={[styles.total, { color: colors.foreground, fontSize: 15 * fs }]} numberOfLines={1}>
            {plain(order.total)}
          </Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.cardBottom}>
          <View style={styles.cardFields}>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.mutedForeground, fontSize: 13 * fs }]}>PO SHEET</Text>
              {!!order.po && (
                <Text style={[styles.cardLink, { color: colors.accent, fontSize: 14 * fs }]} numberOfLines={1}>{order.po}</Text>
              )}
            </View>
            {!!order.invoice && (
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.mutedForeground, fontSize: 13 * fs }]}>INVOICE</Text>
                <Text style={[styles.cardLink, { color: colors.accent, fontSize: 14 * fs }]} numberOfLines={1}>{order.invoice}</Text>
              </View>
            )}
          </View>
          {!!status && (
            <View style={styles.cardStatusRight}>
              <View style={[styles.statusBadge, { backgroundColor: colors.primary }]}>
                <Text style={[styles.statusBadgeText, { fontSize: 11 * fs }]} numberOfLines={2}>
                  {wmsStatusLabel(status)}
                </Text>
              </View>
              {!!statusDate && (
                <Text style={[styles.statusDate, { color: colors.mutedForeground, fontSize: 11 * fs }]}>
                  {statusDate}
                </Text>
              )}
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  const detailWms = selectedOrder ? wmsForOrder(selectedOrder) : null;
  const detailSteps = detailWms
    ? WMS_DATED_STEPS.flatMap(({ field, label }) => {
        const raw = detailWms[field];
        const date = typeof raw === 'string' ? wmsDate(raw) : '';
        return date ? [{ field, label, date, time: wmsTime(raw as string) }] : [];
      })
    : [];
  const wmsInformation = detailWms ? [
    { label: 'WMS VENDOR', value: detailWms.vendor },
    { label: 'DEPARTMENT', value: detailWms.type },
    { label: 'ASSIGNED STORE', value: detailWms.assignedStoreName },
    { label: 'BOX COUNT', value: detailWms.totalBoxCount },
    { label: 'CREATED AT', value: detailWms.createdAt ? [wmsDate(detailWms.createdAt), wmsTime(detailWms.createdAt)].filter(Boolean).join(' ') : null },
  ].filter((field) => field.value !== null && field.value !== undefined && field.value !== '') : [];

  if (!allowed) return <Redirect href="/" />;

  if (selectedOrder) {
    const detailStatus = detailWms?.status?.trim();
    const detailStatusDate = detailWms ? wmsStatusDate(detailWms) : '';
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <View style={[styles.detailHeader, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => setSelectedOrder(null)} accessibilityRole="button" accessibilityLabel="Back to purchases" style={styles.detailBack}>
            <Feather name="chevron-left" size={22} color={colors.primary} />
            <Text style={[styles.detailBackText, { color: colors.primary }]}>PURCHASE</Text>
          </Pressable>
          <View style={styles.detailHero}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.detailVendor, { color: colors.foreground, fontSize: 25 * fs }]} numberOfLines={2}>
                {selectedOrder.vendor}
              </Text>
              {!!selectedOrder.date && (
                <Text style={[styles.detailSub, { color: colors.mutedForeground }]}>ORDER DATE · {selectedOrder.date}</Text>
              )}
              {!!selectedOrder.invoice && (
                <Text style={[styles.detailSub, { color: colors.mutedForeground }]}>INVOICE · {selectedOrder.invoice}</Text>
              )}
            </View>
            {!!detailStatus && (
              <View style={styles.cardStatusRight}>
                <View style={[styles.statusBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.statusBadgeText}>{wmsStatusLabel(detailStatus)}</Text>
                </View>
                {!!detailStatusDate && (
                  <Text style={[styles.statusDate, { color: colors.mutedForeground }]}>{detailStatusDate}</Text>
                )}
              </View>
            )}
          </View>
          <Text style={[styles.detailAmount, { color: colors.foreground, fontSize: 22 * fs }]}>
            {money(selectedOrder.total)}
          </Text>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.detailScrollContent}>
          {!!(selectedOrder.poUrl || selectedOrder.invoiceUrl) && (
            <View style={[styles.detailPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.detailSectionTitle, { color: colors.mutedForeground }]}>DOCUMENTS</Text>
              <View style={styles.documentRow}>
                {!!selectedOrder.poUrl && (
                  <Pressable onPress={() => void openLink(selectedOrder.poUrl)} style={[styles.documentButton, { borderColor: colors.border, backgroundColor: colors.background }]} accessibilityRole="link">
                    <Feather name="file-text" size={21} color={colors.primary} />
                    <Text style={[styles.documentText, { color: colors.foreground }]}>PO SHEET</Text>
                  </Pressable>
                )}
                {!!selectedOrder.invoiceUrl && (
                  <Pressable onPress={() => void openLink(selectedOrder.invoiceUrl)} style={[styles.documentButton, { borderColor: colors.border, backgroundColor: colors.background }]} accessibilityRole="link">
                    <Feather name="file-text" size={21} color={colors.primary} />
                    <Text style={[styles.documentText, { color: colors.foreground }]}>PDF FILE</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
          <View style={[styles.detailPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.detailSectionTitle, { color: colors.mutedForeground }]}>ORDER INFORMATION</Text>
            <View style={styles.detailInfoGrid}>
              {!!selectedOrder.invoice && <View style={styles.infoCell}><Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>INVOICE</Text><Text style={[styles.infoValue, { color: colors.foreground }]}>{selectedOrder.invoice}</Text></View>}
              {!!selectedOrder.po && <View style={styles.infoCell}><Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>PO SHEET</Text><Text style={[styles.infoValue, { color: colors.foreground }]}>{selectedOrder.po}</Text></View>}
              {!!selectedOrder.date && <View style={styles.infoCell}><Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>ORDER DATE</Text><Text style={[styles.infoValue, { color: colors.foreground }]}>{selectedOrder.date}</Text></View>}
              <View style={styles.infoCell}><Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>AMOUNT</Text><Text style={[styles.infoValue, { color: colors.foreground }]}>{money(selectedOrder.total)}</Text></View>
            </View>
          </View>
          {detailSteps.length > 0 && (
            <View style={[styles.detailPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.detailSectionTitle, { color: colors.mutedForeground }]}>WAREHOUSE PROGRESS</Text>
              {detailSteps.map((step, index) => (
                <View key={step.field} style={styles.timelineRow}>
                  <View style={styles.timelineTrack}>
                    <View style={[styles.timelineDot, { backgroundColor: colors.primary }]}>
                      <Feather name="check" size={11} color="#FFFFFF" />
                    </View>
                    {index < detailSteps.length - 1 && <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />}
                  </View>
                  <Text style={[styles.timelineName, { color: colors.foreground }]}>{step.label}</Text>
                  <View style={styles.timelineDateArea}>
                    <Text style={[styles.timelineDate, { color: colors.foreground }]}>{step.date}</Text>
                    {!!step.time && <Text style={[styles.timelineTime, { color: colors.mutedForeground }]}>{step.time}</Text>}
                  </View>
                </View>
              ))}
            </View>
          )}
          {wmsInformation.length > 0 && (
            <View style={[styles.detailPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.detailSectionTitle, { color: colors.mutedForeground }]}>WAREHOUSE INFORMATION</Text>
              <View style={styles.detailInfoGrid}>
                {wmsInformation.map((field) => (
                  <View key={field.label} style={styles.infoCell}>
                    <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
                    <Text style={[styles.infoValue, { color: colors.foreground }]}>{String(field.value)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
      <View style={[styles.header, isTotal && { paddingBottom: 8 }, { borderBottomColor: colors.border }]}>
        <View style={[styles.toolbar, isTotal && { marginBottom: 0 }]}>
          <View style={styles.storeHeadingGroup}>
            <View style={styles.storeControls}>
              <Pressable
                onPress={nextStore}
                disabled={allowedStores.length < 2}
                style={({ pressed }) => [styles.storeTitlePress, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Selected store ${isTotal ? 'OVERVIEW' : storeName}. Tap to select next store.`}
                testID="purchase-store-next"
              >
                <Text
                  style={[styles.heading, { color: colors.primary, fontSize: 19 * fs }]}
                  numberOfLines={1}
                >
                  {isTotal ? 'OVERVIEW' : storeName}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setStorePickerOpen(true)}
                disabled={allowedStores.length < 2}
                style={({ pressed }) => [styles.storeChevron, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Open store dropdown"
                testID="purchase-store-dropdown"
              >
                <Feather name="chevron-down" size={20} color={colors.primary} />
              </Pressable>
            </View>
            <View style={[styles.storeControls, isTotal && { marginTop: 6 }]}>
              <Pressable
                onPress={nextMonth}
                style={({ pressed }) => [styles.storeTitlePress, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Selected ${selectedMonthName} ${selectedPeriod.year}. Tap for next month.`}
                testID="purchase-month-next"
              >
                <Text style={[styles.month, { color: colors.mutedForeground, fontSize: 14 * fs }]}>
                  {selectedMonthName} {selectedPeriod.year}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => { setPickerYear(selectedPeriod.year); setMonthPickerOpen(true); }}
                style={({ pressed }) => [styles.storeChevron, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Open month and year dropdown"
                testID="purchase-month-dropdown"
              >
                <Feather name="chevron-down" size={20} color={colors.primary} style={{ opacity: 0 }} />
              </Pressable>
            </View>
          </View>
          <View style={styles.toolbarRight}>
            {allowedDepartments.length > 1 ? (
              <Pressable
                onPress={() => { setDepartment(effectiveDepartment === 'GM' ? 'PRODUCT' : 'GM'); setResult(null); }}
                style={({ pressed }) => [
                  styles.departmentToggle,
                  { backgroundColor: colors.primary, borderColor: colors.primary },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Department ${effectiveDepartment}. Tap to switch department.`}
                testID="purchase-department-toggle"
              >
                <Text style={{ color: '#FFFFFF', fontSize: 11 * fs, fontFamily: 'Inter_600SemiBold' }}>
                  {effectiveDepartment}
                </Text>
              </Pressable>
            ) : (
              <Text style={[styles.departmentTag, { color: colors.mutedForeground }]}>{effectiveDepartment}</Text>
            )}
            <Pressable onPress={refresh} style={styles.refresh} accessibilityLabel="Refresh purchases" testID="purchase-refresh">
              <Feather name="refresh-cw" size={19} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>
        {!isTotal && (<>
        <View style={[styles.budgetCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.budgetMetric}>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>SPENT</Text>
            <Text style={[styles.metricValue, { color: colors.foreground, fontSize: 16 * fs }]}>{money(currentStore?.spent)}</Text>
          </View>
          <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />
          <View style={styles.budgetMetric}>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>REMAINING</Text>
            <Text style={[styles.metricValue, { color: remaining != null && remaining < 0 ? colors.destructive : colors.foreground, fontSize: 16 * fs }]}>
              {money(remaining)}
            </Text>
          </View>
        </View>
        <View style={styles.counterRow}>
          <View style={[styles.counter, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.counterLabel, { color: colors.mutedForeground }]}>INVOICED</Text>
            <Text style={[styles.counterValue, { color: colors.foreground }]}>{count(currentStore?.invoiced)}</Text>
          </View>
          <View style={[styles.counter, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.counterLabel, { color: colors.mutedForeground }]}>PROCESSING</Text>
            <Text style={[styles.counterValue, { color: colors.foreground }]}>{count(result?.configured === true ? missing.length : null)}</Text>
          </View>
        </View>
        </>)}
      </View>

      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {loading && <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />}
        {!!failure && (
          <View style={[styles.notice, { borderColor: colors.destructive }]}>
            <Text style={{ color: colors.destructive, lineHeight: 20 }}>{failure}</Text>
            <Pressable onPress={refresh}><Text style={{ color: colors.accent, marginTop: 10 }}>RETRY</Text></Pressable>
          </View>
        )}
        {!loading && !failure && result?.configured === false && (
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>
            {result.message || 'This department has no purchase source sheet yet.'}
          </Text>
        )}
        {!loading && !failure && result?.configured !== false && isTotal && (
          <View style={styles.totalWrap}>
            <View style={[styles.overviewSummary, { backgroundColor: overviewPalette.card, borderColor: overviewPalette.card }]}>
              {/* Subtle glow and legible summary text follow the active theme. */}
              <View pointerEvents="none" style={[styles.overviewSummaryGlow, { backgroundColor: overviewPalette.glow, opacity: 0.065 }]} />
              <View style={styles.overviewMetrics}>
                <View style={styles.overviewMetric}>
                  <Text style={[styles.overviewMetricLabel, { color: '#FFFFFF', fontSize: 11 * fs }]}>BUDGET</Text>
                  <Text style={[styles.overviewMetricAmount, { color: '#FFFFFF', fontSize: 19 * fs }]}
                    numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                    {plain(totalSum.budget)}
                  </Text>
                </View>
                <View style={[styles.overviewMetricSeparator, { backgroundColor: overviewPalette.divider }]} />
                <View style={styles.overviewMetric}>
                  <Text style={[styles.overviewMetricLabel, { color: '#FFFFFF', fontSize: 11 * fs }]}>SPENT</Text>
                  <Text style={[styles.overviewMetricAmount, { color: '#FFFFFF', fontSize: 19 * fs }]}
                    numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                    {plain(totalSum.spent)}
                  </Text>
                </View>
              </View>
              <View style={styles.overviewRemainingRow}>
                <View style={[styles.overviewRemainingPill, { backgroundColor: overviewPalette.pill }]}>
                  <Text style={[styles.overviewRemainingLabel, { color: overviewPalette.pillText, fontSize: 11 * fs }]}>REMAINING</Text>
                  <View style={[styles.overviewRemainingSeparator, { backgroundColor: overviewPalette.pillDivider }]} />
                  <MoneyText
                    value={totalSum.remaining}
                    size={19 * fs}
                    color={totalSum.remaining != null && totalSum.remaining < 0 ? colors.destructive : overviewPalette.remainingGreen}
                    style={styles.overviewRemainingAmount}
                  />
                </View>
              </View>
            </View>

            <View style={styles.overviewStoreList}>
              {totalRows.map((row) => (
                <Pressable
                  key={row.name}
                  onPress={() => setStoreName(row.name)}
                  disabled={!allowedStores.includes(row.name)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${row.name}`}
                  testID={`purchase-total-row-${row.name}`}
                  style={({ pressed }) => [
                    styles.overviewStoreCard,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.overviewStoreMark}>
                    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.primary, opacity: 0.10 }]} />
                    <Text style={[styles.overviewStoreMarkText, { color: colors.foreground, fontSize: 15 * fs }]}>
                      {STORE_MARKS[row.name] ?? row.name.slice(0, 2)}
                    </Text>
                  </View>
                  <View style={styles.overviewStoreInfo}>
                    <Text style={[styles.overviewStoreName, { color: colors.foreground, fontSize: 14 * fs }]}
                      numberOfLines={1} adjustsFontSizeToFit>
                      {row.name}
                    </Text>
                    <Text style={[styles.overviewStoreFigures, { color: colors.mutedForeground, fontSize: 11 * fs }]}
                      numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                      {plain(row.budget)} / {plain(row.spent)}
                    </Text>
                  </View>
                  <MoneyText
                    value={row.remaining}
                    size={15 * fs}
                    color={row.remaining != null && row.remaining < 0 ? colors.destructive : colors.foreground}
                    style={styles.overviewStoreRemaining}
                  />
                  <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
                </Pressable>
              ))}
            </View>
          </View>
        )}
        {!loading && !failure && result?.configured !== false && !isTotal && (
          <>
            {issued.length > 0 && issued.map(renderOrder)}
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: 15 * fs }]}>AWAITING INVOICE</Text>
              <Text style={{ color: colors.mutedForeground }}>{missing.length}</Text>
            </View>
            {missing.map(renderOrder)}
            {storeName && storeOrders.length === 0 && (
              <Text style={[styles.empty, { color: colors.mutedForeground }]}>No purchase orders for this store.</Text>
            )}
          </>
        )}
      </ScrollView>

      <Modal
        visible={monthPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMonthPickerOpen(false)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setMonthPickerOpen(false)}>
          <Pressable style={[styles.pickerSheet, { backgroundColor: colors.card }]} onPress={() => {}}>
            <Text style={[styles.pickerTitle, { color: colors.mutedForeground }]}>SELECT MONTH / YEAR</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Pressable onPress={() => setPickerYear((y) => y - 1)} style={styles.storeChevron} accessibilityLabel="Previous year">
                <Feather name="chevron-left" size={20} color={colors.primary} />
              </Pressable>
              <Text style={[styles.heading, { color: colors.foreground, fontSize: 18 * fs }]}>{pickerYear}</Text>
              <Pressable onPress={() => setPickerYear((y) => y + 1)} style={styles.storeChevron} accessibilityLabel="Next year">
                <Feather name="chevron-right" size={20} color={colors.primary} />
              </Pressable>
            </View>
            <FlatList
              data={[...MONTH_NAMES]}
              keyExtractor={(name) => name}
              renderItem={({ item, index }) => {
                const selected = selectedPeriod.year === pickerYear && selectedPeriod.month === index;
                return (
                  <Pressable
                    style={({ pressed }) => [styles.pickerOption, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setSelectedPeriod({ month: index, year: pickerYear });
                      setResult(null);
                      setMonthPickerOpen(false);
                    }}
                  >
                    <Text style={{
                      color: selected ? colors.accent : colors.foreground,
                      fontSize: 15 * fs,
                      fontFamily: selected ? 'Inter_600SemiBold' : 'Inter_400Regular',
                    }}>
                      {item}
                    </Text>
                    {selected && <Feather name="check" size={16} color={colors.accent} />}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={storePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setStorePickerOpen(false)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setStorePickerOpen(false)}>
          <Pressable
            style={[styles.pickerSheet, { backgroundColor: colors.card }]}
            onPress={() => {}}
          >
            <Text style={[styles.pickerTitle, { color: colors.mutedForeground }]}>SELECT STORE</Text>
            <FlatList
              data={allowedStores}
              keyExtractor={(name) => name}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [styles.pickerOption, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: item === storeName }}
                  onPress={() => { setStoreName(item); setStorePickerOpen(false); }}
                >
                  <Text
                    style={{
                      color: item === storeName ? colors.accent : colors.foreground,
                      fontSize: 15 * fs,
                      fontFamily: item === storeName ? 'Inter_600SemiBold' : 'Inter_400Regular',
                    }}
                  >
                    {item === TOTAL_STORE ? 'OVERVIEW' : item}
                  </Text>
                  {item === storeName && <Feather name="check" size={16} color={colors.accent} />}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 13, borderBottomWidth: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 },
  toolbarRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  storeHeadingGroup: { flex: 1, minWidth: 0 },
  storeControls: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', maxWidth: '100%' },
  storeTitlePress: { flexShrink: 1, paddingVertical: 5 },
  storeChevron: { paddingHorizontal: 7, paddingVertical: 8, minWidth: 32 },
  pressed: { opacity: 0.65 },
  heading: { fontFamily: 'Inter_700Bold' },
  departmentToggle: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 4, minWidth: 64, alignItems: 'center' },
  departmentTag: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  refresh: { padding: 7 },
  month: { fontFamily: 'Inter_600SemiBold' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  pickerSheet: { borderRadius: 16, padding: 16, maxHeight: '70%' },
  pickerTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12, letterSpacing: 1, marginBottom: 8 },
  pickerOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  budgetCard: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderRadius: 12 },
  budgetMetric: { flex: 1, gap: 3 },
  metricLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.5 },
  metricValue: { fontFamily: 'Inter_700Bold' },
  metricDivider: { width: 1, marginHorizontal: 12 },
  counterRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  counter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2, paddingHorizontal: 13, borderWidth: 1, borderRadius: 10 },
  counterLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  counterValue: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  scroll: { flex: 1 },
  scrollContent: { padding: 12, paddingBottom: 100 },
  card: { paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderRadius: 14, marginBottom: 10 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  vendorDateRow: { flex: 1, flexDirection: 'row', alignItems: 'baseline', minWidth: 0 },
  date: { fontFamily: 'Inter_500Medium', marginLeft: 18, flexShrink: 0 },
  vendor: { fontFamily: 'Inter_700Bold', flexShrink: 1 },
  cardBottom: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 9 },
  cardFields: { flex: 1, minWidth: 0 },
  cardLink: { flexShrink: 1, fontFamily: 'Inter_600SemiBold', textDecorationLine: 'underline' },
  cardStatusRight: { minWidth: 94, alignItems: 'flex-end', justifyContent: 'flex-start' },
  statusBadge: { minWidth: 80, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 4, alignItems: 'center' },
  statusBadgeText: { color: '#FFFFFF', fontSize: 11, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  statusDate: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 4, textAlign: 'right', alignSelf: 'flex-end' },
  divider: { height: 1, marginVertical: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  detailLabel: { width: 90, fontFamily: 'Inter_500Medium' },
  detailValue: { flex: 1, alignItems: 'flex-start' },
  total: { fontFamily: 'Inter_700Bold', fontVariant: ['tabular-nums'] },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 12, alignItems: 'center' },
  sectionTitle: { fontFamily: 'Inter_700Bold' },
  empty: { paddingVertical: 28, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  spinner: { marginVertical: 28 },
  notice: { padding: 16, borderWidth: 1, borderRadius: 10, marginBottom: 12 },
  detailHeader: { paddingHorizontal: 18, paddingTop: 15, paddingBottom: 18, borderBottomWidth: 1 },
  detailBack: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 3, paddingVertical: 6 },
  detailBackText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  detailHero: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginTop: 17 },
  detailVendor: { fontFamily: 'Inter_700Bold' },
  detailSub: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 5 },
  detailAmount: { fontFamily: 'Inter_700Bold', marginTop: 10 },
  detailScrollContent: { padding: 14, paddingBottom: 80 },
  detailPanel: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 12 },
  detailSectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.8, marginBottom: 14 },
  documentRow: { flexDirection: 'row', gap: 9 },
  documentButton: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 10, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 9 },
  documentText: { fontFamily: 'Inter_700Bold', fontSize: 12, flexShrink: 1 },
  detailInfoGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 },
  infoCell: { width: '50%', paddingRight: 10 },
  infoLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.4 },
  infoValue: { fontFamily: 'Inter_700Bold', fontSize: 13, marginTop: 4 },
  timelineRow: { minHeight: 60, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  timelineTrack: { alignItems: 'center', width: 18, alignSelf: 'stretch' },
  timelineDot: { width: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  timelineLine: { flex: 1, width: 1, minHeight: 20 },
  timelineName: { fontFamily: 'Inter_700Bold', fontSize: 13, flex: 1 },
  timelineDateArea: { alignItems: 'flex-end' },
  timelineDate: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  timelineTime: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 },
  // OVERVIEW: one theme-washed summary and distinct neutral store cards.
  totalWrap: { marginHorizontal: -3, marginTop: -1, gap: 10 },
  overviewSummary: { borderWidth: 1, borderRadius: 18, padding: 9, overflow: 'hidden' },
  overviewSummaryGlow: { position: 'absolute', right: -64, top: -72, width: 230, height: 230, borderRadius: 115 },
  overviewMetrics: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 5, paddingTop: 1, paddingBottom: 6 },
  overviewMetric: { flex: 1, minWidth: 0, gap: 4 },
  overviewMetricLabel: { fontFamily: 'Inter_600SemiBold', letterSpacing: 0.4 },
  overviewMetricAmount: { fontFamily: 'Inter_700Bold', fontVariant: ['tabular-nums'] },
  overviewMetricSeparator: { width: 1, height: 34 },
  overviewRemainingRow: { flexDirection: 'row', alignItems: 'center', minHeight: 36 },
  overviewRemainingPill: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', paddingLeft: 13, paddingRight: 18, height: 30, borderRadius: 10, gap: 10 },
  overviewRemainingLabel: { fontFamily: 'Inter_600SemiBold', flexShrink: 0 },
  overviewRemainingSeparator: { height: 16, width: 1 },
  overviewRemainingAmount: { flex: 1, minWidth: 0, textAlign: 'center' },
  overviewStoreList: { gap: 6 },
  overviewStoreCard: { minHeight: 65, borderRadius: 15, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, gap: 10 },
  overviewStoreMark: { width: 43, height: 43, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  overviewStoreMarkText: { fontFamily: 'Inter_700Bold', letterSpacing: 0.2 },
  overviewStoreInfo: { flex: 1, minWidth: 0, gap: 3 },
  overviewStoreName: { fontFamily: 'Inter_700Bold' },
  overviewStoreFigures: { fontFamily: 'Inter_500Medium', fontVariant: ['tabular-nums'] },
  overviewStoreRemaining: { flexShrink: 1, maxWidth: '36%', textAlign: 'right' },
});