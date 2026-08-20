import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@/components/AppIcon';
import { useColors } from '@/hooks/useColors';
import { useApp, useFontScale } from '@/context/AppContext';
import Dropdown from '@/components/Dropdown';

function notify(title: string, msg: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${msg}`);
  else Alert.alert(title, msg);
}

function confirmAsync(title: string, msg: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${msg}`));
  return new Promise((resolve) => {
    Alert.alert(title, msg, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'OK', onPress: () => resolve(true) },
    ]);
  });
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const fs = useFontScale();
  const app = useApp();

  const [savedSelection, setSavedSelection] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Import 관련 추가 UI 상태
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [loadingTabs, setLoadingTabs] = useState(false);
  const [tabList, setTabList] = useState<string[]>([]);
  const [importingTab, setImportingTab] = useState(false);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await app.syncFromSheets();
      if (!res.ok) notify('Sync failed', res.message);
    } finally {
      setSyncing(false);
    }
  };

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const store = app.stores.find((s) => s.id === app.selectedStoreId);
  const vendor = app.vendors.find((v) => v.id === app.selectedVendorId);
  const c = (k: string, f: string) => app.appearance[k] || f;

  const guardedChange = (kind: 'store' | 'vendor', id: string | null) => {
    const current = kind === 'store' ? app.selectedStoreId : app.selectedVendorId;
    const apply = () => {
      if (kind === 'store') app.setSelectedStoreId(id);
      else app.setSelectedVendorId(id);
    };
    if (app.cart.length === 0 || id === current) {
      apply();
      return;
    }
    if (kind === 'vendor') {
      const saved = app.saveCart();
      if (saved) notify('Auto-saved', `Cart saved as:\n${saved.name}`);
      else app.clearCart();
      apply();
      return;
    }

    const doSave = () => {
      const saved = app.saveCart();
      if (saved) notify('Cart saved', saved.name);
      apply();
    };
    const doChange = () => apply();

    if (Platform.OS === 'web') {
      if (window.confirm('Cart has items.\n\nSave the cart before changing store?\n(Cancel = more options)')) {
        doSave();
      } else if (window.confirm('Change store and keep the cart as is?\n(Cancel = keep current store)')) {
        doChange();
      }
      return;
    }
    Alert.alert('Cart has items', 'What would you like to do?', [
      { text: 'SAVE CART', onPress: doSave },
      { text: 'CHANGE STORE', onPress: doChange },
      { text: 'CANCEL', style: 'cancel' },
    ]);
  };

  const buildOrderPayload = () => {
    const items = app.cart.map((c) => {
      const p = app.findByUpc(c.upc);
      return {
        upc: c.upc,
        itemCode: p?.itemCode ?? '',
        description: p?.description ?? '',
        cost: p?.cost ?? 0,
        qty: c.qty,
        amount: (p?.cost ?? 0) * c.qty,
      };
    });
    return {
      v: app.appVersion,
      type: 'order',
      store: store?.name ?? '',
      storeAddress: app.shipToJBS
        ? app.stores.find((s) => s.name.startsWith('JBS'))?.address ?? ''
        : store?.address ?? '',
      shipToJBS: app.shipToJBS,
      vendor: vendor?.name ?? '',
      vendorEmail: vendor?.email ?? '',
      user: app.session?.email ?? '',
      total: app.cartTotal,
      createdAt: new Date().toISOString(),
      items,
    };
  };

  const requireReady = (): boolean => {
    if (!app.selectedStoreId) { notify('Notice', 'Select a store'); return false; }
    if (!app.selectedVendorId) { notify('Notice', 'Select a vendor'); return false; }
    if (app.cart.length === 0) { notify('Notice', 'Cart is empty'); return false; }
    return true;
  };

  const handleSend = async () => {
    if (!requireReady()) return;
    const url = app.settings.appsScriptUrl.trim();
    if (!url) {
      notify('Setup required', 'Register the Apps Script URL in the SETTING tab first.\nOrders cannot be sent until it is set.');
      return;
    }
    const ok = await confirmAsync(
      'Send Order',
      `Send ${vendor?.name ?? ''} order?\nTotal $${app.cartTotal.toFixed(2)}\n\nThe order will be emailed to the vendor.`
    );
    if (!ok) return;
    setSending(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(buildOrderPayload()),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => ({}));
      setSending(false);
      if (data && data.busy) {
        notify('Server busy', '서버에서 다른 일 처리 중에 있습니다.\n잠시 후에 다시 시도해 주세요.');
        return;
      }
      if (data && data.ok === false) {
        notify('Send failed', `An error occurred while sending the order.\n${data.error ?? ''}`);
        return;
      }
      if (data && data.emailed === false) {
        notify(
          'Recorded, but NO email sent',
          `Order was recorded and archived, but the vendor email was NOT sent.\n\nReason: ${data.emailNote || 'unknown'}`
        );
      } else {
        notify('Sent', `${vendor?.name} order sent.\nTotal $${app.cartTotal.toFixed(2)}`);
      }
      app.clearCart();
    } catch (e: any) {
      setSending(false);
      notify('Send failed', `An error occurred while sending the order.\n${e?.message ?? ''}`);
    }
  };

  const handleSave = () => {
    if (!requireReady()) return;
    const saved = app.saveCart();
    if (saved) notify('Saved', saved.name);
  };

  const handleLoad = () => {
    if (!savedSelection) { notify('Notice', 'Select a saved order to load'); return; }

    if (app.cart.length > 0) {
      const saved = app.saveCart();
      if (saved) {
        notify('Auto-saved', `Current cart saved as:\n${saved.name}`);
      }
    }

    app.loadCart(savedSelection);
    setSavedSelection(null);
    notify('Loaded', 'Saved order moved into cart');
  };

  // Export / Import 선택 핸들러
  const handleExport = async () => {
    const url = app.settings.appsScriptUrl.trim();
    if (!url) {
      notify('Setup required', 'Register the Apps Script URL in the SETTING tab first.');
      return;
    }

    if (Platform.OS === 'web') {
      const isExport = window.confirm('Click [OK] to EXPORT or [Cancel] to IMPORT from Google Sheet');
      if (isExport) {
        executeExport(url);
      } else {
        openImportModal();
      }
      return;
    }

    Alert.alert('Excel Options', 'Choose an action for Google Sheets', [
      { text: 'EXPORT', onPress: () => executeExport(url) },
      { text: 'IMPORT', onPress: openImportModal },
      { text: 'CANCEL', style: 'cancel' },
    ]);
  };

  // 기존 Export 실행
  const executeExport = async (url: string) => {
    if (!requireReady()) return;

    const ok = await confirmAsync('Export', `Export ${vendor?.name ?? ''} order?`);
    if (!ok) return;

    setExporting(true);
    try {
      const payload = {
        ...buildOrderPayload(),
        action: 'export',
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => ({}));
      setExporting(false);

      if (data && data.busy) {
        notify('Server busy', 'Server is processing another export.\nPlease try again shortly.');
        return;
      }

      if (data && data.ok === false) {
        notify('Export failed', data.error ?? 'Unknown error');
        return;
      }

      notify('Export Complete', `${vendor?.name ?? ''} exported successfully.`);
      app.clearCart();
    } catch (e: any) {
      setExporting(false);
      notify('Export failed', e?.message ?? 'Unknown error');
    }
  };

  // Import 모달 열기 및 Context를 통한 탭 목록 수신
  const openImportModal = async () => {
    setLoadingTabs(true);
    setImportModalVisible(true);
    try {
      if (app.getTabList) {
        const res = await app.getTabList();
        if (res.ok && res.tabs) {
          setTabList(res.tabs);
        } else {
          notify('Failed', res.message || 'Failed to fetch sheet tabs');
          setImportModalVisible(false);
        }
      }
    } catch (e: any) {
      notify('Failed', e?.message ?? 'Failed to connect server');
      setImportModalVisible(false);
    } finally {
      setLoadingTabs(false);
    }
  };

  // 탭 선택 시 처리 (카트 저장 후 Context의 importFromSheet 호출)
  const handleSelectTab = async (tabName: string) => {
    if (app.cart.length > 0) {
      const saved = app.saveCart();
      if (saved) {
        notify('Auto-saved', `Current cart auto-saved as:\n${saved.name}`);
      }
    }

    setImportingTab(true);
    try {
      if (app.importFromSheet) {
        const res = await app.importFromSheet(tabName);
        if (res.ok) {
          notify('Import Success', `Loaded sheet tab: ${tabName}`);
          setImportModalVisible(false);
        } else {
          notify('Import Failed', res.message || 'Failed to import tab data');
        }
      }
    } catch (e: any) {
      notify('Import Failed', e?.message ?? 'Failed to import tab data');
    } finally {
      setImportingTab(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c('home.bg', colors.background) }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topPad + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={[styles.brand, { color: c('home.brandColor', colors.primary), fontSize: 20 * fs }]}>
              {app.settings.appTitle}
            </Text>
            <Text style={[styles.userEmail, { color: colors.mutedForeground, fontSize: 12 * fs }]}>
              {app.session?.email}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={handleSync}
              disabled={syncing}
              style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.5 }]}
              testID="sync-now"
            >
              {syncing ? (
                <ActivityIndicator size="small" color={colors.mutedForeground} />
              ) : (
                <Feather name="refresh-cw" size={20} color={colors.mutedForeground} />
              )}
            </Pressable>
            <Pressable
              onPress={app.logout}
              style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.5 }]}
              testID="logout"
            >
              <Feather name="log-out" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>

        <View style={[styles.totalCard, { backgroundColor: c('home.totalCardColor', colors.totalCard ?? colors.primary) }]}>
          <Text style={[styles.totalLabel, colors.totalLabel ? { color: colors.totalLabel } : null]}>
            {c('home.totalLabel', 'TOTAL')}
          </Text>
          <Text style={[styles.totalValue, { fontSize: 36 * fs }]}>
            ${app.cartTotal.toFixed(2)}
          </Text>
          <Text style={[styles.totalSub, colors.totalLabel ? { color: colors.totalLabel } : null]}>
            {app.cart.length} items · {app.cart.reduce((s, c) => s + c.qty, 0)} units
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            {c('home.storeLabel', 'SELECT STORE')}
          </Text>
          <Dropdown
            placeholder="Select store"
            options={app.stores.map((s) => ({
              value: s.id, label: s.name, sublabel: `${s.address}`,
            }))}
            value={app.selectedStoreId}
            onChange={(id) => guardedChange('store', id)}
            testID="select-store"
          />
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: colors.foreground, fontSize: 12.5 * fs }]}>
              {c('home.shipLabel', 'SHIP TO JBS')}
            </Text>
            <Switch
              value={app.shipToJBS}
              onValueChange={app.setShipToJBS}
              trackColor={{ true: colors.accent, false: colors.border }}
              thumbColor="#fff"
              testID="ship-to-jbs"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            {c('home.vendorLabel', 'SELECT VENDOR')}
          </Text>
          <Dropdown
            placeholder="Select vendor"
            options={app.vendors.map((v) => ({
              value: v.id, label: v.name, sublabel: `${v.salesPerson} · ${v.email}`,
            }))}
            value={app.selectedVendorId}
            onChange={(id) => guardedChange('vendor', id)}
            testID="select-vendor"
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            {c('home.savedLabel', 'SAVED LIST')}
          </Text>
          <Dropdown
            placeholder="Select saved order"
            options={app.savedCarts
              .filter((s) => s.userEmail === app.session?.email)
              .map((s) => ({ value: s.id, label: s.name }))}
            value={savedSelection}
            onChange={setSavedSelection}
            onDeleteOption={(id) => {
              app.deleteSavedCart(id);
              if (savedSelection === id) setSavedSelection(null);
            }}
            testID="saved-list"
          />
        </View>

        <View style={styles.buttonGrid}>
          <ActionButton
            icon={<Feather name="send" size={22} color={colors.actionBtnIcon ?? '#fff'} />}
            label={c('home.sendLabel', 'SEND')}
            color={c('home.sendColor', colors.sendBtn ?? colors.accent)}
            textColor={colors.actionBtnText}
            onPress={handleSend}
            testID="btn-send"
          />
          <ActionButton
            icon={<MaterialCommunityIcons name="microsoft-excel" size={22} color={colors.actionBtnIcon ?? '#fff'} />}
            label={c('home.exportLabel', 'EXPORT / IMPORT')}
            color={c('home.exportColor', colors.exportBtn ?? colors.success)}
            textColor={colors.actionBtnText}
            onPress={handleExport}
            testID="btn-export"
          />
          <ActionButton
            icon={<Feather name="save" size={22} color={colors.actionBtnIcon ?? '#fff'} />}
            label={c('home.saveLabel', 'SAVE')}
            color={c('home.saveColor', colors.saveBtn ?? colors.primary)}
            borderColor={colors.saveBtnBorder}
            textColor={colors.actionBtnText}
            onPress={handleSave}
            testID="btn-save"
          />
          <ActionButton
            icon={<Feather name="download" size={22} color={colors.actionBtnIcon ?? '#fff'} />}
            label={c('home.loadLabel', 'ORDER LOAD')}
            color={c('home.loadColor', colors.loadBtn ?? colors.accent)}
            textColor={colors.actionBtnText}
            onPress={handleLoad}
            testID="btn-load"
          />
        </View>
      </ScrollView>

      {/* Sending Overlay */}
      <Modal visible={sending} transparent animationType="fade">
        <View style={styles.sendingOverlay}>
          <View style={[styles.sendingBox, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="large" color={colors.tint} />
            <Text style={[styles.sendingTitle, { color: colors.text, fontSize: 18 * fs }]}>
              Sending Order…
            </Text>
            <Text style={[styles.sendingSub, { color: colors.muted, fontSize: 14 * fs }]}>
              Please wait. Do not close the app.
            </Text>
          </View>
        </View>
      </Modal>

      {/* Exporting Overlay */}
      <Modal visible={exporting} transparent animationType="fade">
        <View style={styles.sendingOverlay}>
          <View style={[styles.sendingBox, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="large" color={colors.tint} />
            <Text style={[styles.sendingTitle, { color: colors.text, fontSize: 18 * fs }]}>
              Exporting To GOOGLE SHEET…
            </Text>
            <Text style={[styles.sendingSub, { color: colors.muted, fontSize: 14 * fs }]}>
              Please wait. Do not close the app.
            </Text>
          </View>
        </View>
      </Modal>

      {/* Import Sheet Tabs Select Modal */}
      <Modal visible={importModalVisible} transparent animationType="slide">
        <View style={styles.sendingOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Sheet Tab to Import</Text>
              <Pressable onPress={() => setImportModalVisible(false)} style={{ padding: 4 }}>
                <Feather name="x" size={20} color={colors.text} />
              </Pressable>
            </View>

            {loadingTabs || importingTab ? (
              <View style={{ paddingVertical: 30, alignItems: 'center', gap: 10 }}>
                <ActivityIndicator size="large" color={colors.tint} />
                <Text style={{ color: colors.muted }}>
                  {importingTab ? 'Loading Tab Data…' : 'Fetching Sheet Tabs…'}
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 300, marginVertical: 10 }}>
                {tabList.length === 0 ? (
                  <Text style={{ textAlign: 'center', color: colors.muted, marginVertical: 20 }}>
                    No tabs found.
                  </Text>
                ) : (
                  tabList.map((tab) => (
                    <Pressable
                      key={tab}
                      style={({ pressed }) => [
                        styles.tabItem,
                        { borderColor: colors.border },
                        pressed && { backgroundColor: colors.border },
                      ]}
                      onPress={() => handleSelectTab(tab)}
                    >
                      <Feather name="file-text" size={18} color={colors.tint} />
                      <Text style={[styles.tabText, { color: colors.text }]}>{tab}</Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ActionButton({
  icon, label, color, borderColor, textColor, onPress, testID,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
  borderColor?: string;
  textColor?: string;
  onPress: () => void;
  testID?: string;
}) {
  const fs = useFontScale();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionBtn,
        { backgroundColor: color },
        borderColor ? { borderWidth: StyleSheet.hairlineWidth, borderColor } : null,
        pressed && { opacity: 0.8 },
      ]}
      testID={testID}
    >
      {icon}
      <Text style={[styles.actionLabel, { fontSize: 13 * fs }, textColor ? { color: textColor } : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sendingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendingBox: {
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 36,
    alignItems: 'center',
    gap: 12,
    minWidth: 240,
  },
  modalBox: {
    width: '85%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  sendingTitle: { fontWeight: '700' },
  sendingSub: { textAlign: 'center' },
  scroll: { paddingHorizontal: 16, paddingBottom: 120 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  brand: { fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  userEmail: { fontFamily: 'Inter_400Regular', marginTop: 2 },
  logoutBtn: { padding: 8 },
  totalCard: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  totalLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 2,
  },
  totalValue: { color: '#fff', fontFamily: 'Inter_700Bold', marginVertical: 4 },
  totalSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'Inter_400Regular' },
  section: { marginBottom: 16 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_700SemiBold',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 2,
  },
  toggleLabel: { fontFamily: 'Inter_500Medium' },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  actionBtn: {
    flexBasis: '48%',
    flexGrow: 1,
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 6,
  },
  actionLabel: { color: '#fff', fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
});