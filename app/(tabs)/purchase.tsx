import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { Redirect } from 'expo-router';
import { Feather } from '@/components/AppIcon';
import { APP_BUILD_KEY, useApp, useFontScale } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

type Department = 'GM' | 'PRODUCT';

// Independent fixed STORE choices for PURCHASE only. Do not synchronize with
// the HOME/SCAN store selection and do not depend on the response's store list.
const PURCHASE_STORES = [
  'ARLINGTON',
  'CARROLLTON',
  'DALLAS',
  'DESOTO',
  'HOUSTON',
  'IRVING',
  'LEWISVILLE',
  'MANSFIELD',
  'MESQUITE',
  'JBS',
] as const;
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
type PurchaseResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  configured?: boolean;
  month?: string;
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
  const allowedStores = useMemo<string[]>(() => {
    if (isMaster) return [...PURCHASE_STORES];
    if (!allowed || !purchaseAccess) return [];
    return purchaseAccess.stores.includes('ALL')
      ? [...PURCHASE_STORES]
      : purchaseAccess.stores;
  }, [isMaster, allowed, purchaseAccess]);

  const [department, setDepartment] = useState<Department>('GM');
  const [storeName, setStoreName] = useState<string>('LEWISVILLE');
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [result, setResult] = useState<PurchaseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // A single permitted department cannot be switched to another department.
  const effectiveDepartment: Department = allowedDepartments.includes(department)
    ? department : (allowedDepartments[0] ?? 'GM');
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
  }, [allowed, effectiveDepartment, refreshKey, session?.purchaseToken, settings.appsScriptUrl]);


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
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const openLink = async (url: string) => {
    if (!/^https?:\/\//i.test(url)) return;
    try { await Linking.openURL(url); }
    catch { setFailure('Could not open the linked document.'); }
  };

  const renderOrder = (order: PurchaseOrder) => (
    <View
      key={order.id}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.cardTitleRow}>
        <Text style={[styles.date, { color: colors.mutedForeground, fontSize: 11 * fs }]}>{order.date}</Text>
        <Text style={[styles.vendor, { color: colors.foreground, fontSize: 13 * fs }]} numberOfLines={2}>
          {order.vendor || '—'}
        </Text>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.detailRow}>
        <Text style={[styles.detailLabel, { color: colors.mutedForeground, fontSize: 11 * fs }]}>PO SHEET</Text>
        <Pressable onPress={() => void openLink(order.poUrl)} disabled={!order.poUrl} style={styles.detailValue}>
          <Text
            style={{ color: order.poUrl ? colors.accent : colors.foreground, fontSize: 12 * fs, fontFamily: 'Inter_600SemiBold', textDecorationLine: order.poUrl ? 'underline' : 'none' }}
            numberOfLines={2}
          >
            {order.po || '—'}
          </Text>
        </Pressable>
      </View>
      <View style={styles.detailRow}>
        <Text style={[styles.detailLabel, { color: colors.mutedForeground, fontSize: 11 * fs }]}>INVOICE</Text>
        <Pressable onPress={() => void openLink(order.invoiceUrl)} disabled={!order.invoiceUrl} style={styles.detailValue}>
          <Text
            style={{ color: order.invoiceUrl ? colors.accent : colors.foreground, fontSize: 12 * fs, fontFamily: 'Inter_600SemiBold', textDecorationLine: order.invoiceUrl ? 'underline' : 'none' }}
            numberOfLines={2}
          >
            {order.invoice || '—'}
          </Text>
        </Pressable>
      </View>
      <View style={styles.detailRow}>
        <Text style={[styles.detailLabel, { color: colors.mutedForeground, fontSize: 11 * fs }]}>TOTAL</Text>
        <Text style={[styles.total, { color: colors.foreground, fontSize: 13 * fs }]}>{money(order.total)}</Text>
      </View>
    </View>
  );

  if (!allowed) return <Redirect href="/" />;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.toolbar}>
          <View style={styles.storeHeadingGroup}>
            <View style={styles.storeControls}>
              <Pressable
                onPress={nextStore}
                disabled={allowedStores.length < 2}
                style={({ pressed }) => [styles.storeTitlePress, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Selected store ${storeName}. Tap to select next store.`}
                testID="purchase-store-next"
              >
                <Text
                  style={[styles.heading, { color: colors.primary, fontSize: 19 * fs }]}
                  numberOfLines={1}
                >
                  {storeName}
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
            {!!result?.month && (
              <Text style={[styles.month, { color: colors.mutedForeground, fontSize: 12 * fs }]}>
                {result.month}
              </Text>
            )}
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
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
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
        {!loading && !failure && result?.configured !== false && (
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
                    {item}
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
  card: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderRadius: 10, marginBottom: 8 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  date: { fontFamily: 'Inter_500Medium' },
  vendor: { fontFamily: 'Inter_700Bold', textAlign: 'right', flex: 1 },
  divider: { height: 1, marginVertical: 4 },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  detailLabel: { width: 78, fontFamily: 'Inter_500Medium' },
  detailValue: { flex: 1, alignItems: 'flex-start' },
  total: { fontFamily: 'Inter_700Bold' },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 12, alignItems: 'center' },
  sectionTitle: { fontFamily: 'Inter_700Bold' },
  empty: { paddingVertical: 28, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  spinner: { marginVertical: 28 },
  notice: { padding: 16, borderWidth: 1, borderRadius: 10, marginBottom: 12 },
});