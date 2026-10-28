import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  Linking,
  KeyboardAvoidingView,
  Keyboard, 
  TouchableWithoutFeedback,
  Animated,
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@/components/AppIcon';
import { useColors } from '@/hooks/useColors';
import { useApp, useFontScale, calcPrice } from '@/context/AppContext';
import Dropdown from '@/components/Dropdown';
import type { SavedCart } from '@/context/AppContext';

const BANNER_IDS = [
  '1_7tBzi3mbz6hxm1iieW1hvoV5qN9NcwJ', // Banner 01
  '1TmXrMlFMeKc2tcdR0vVhTutcgWGpq5qg', // Banner 02
  '19lBTiadrvldStg_qPsnwiNHraBcdkhEx', // Banner 03
  '18oGYgJrxz5qHd7zBzQbzckzhd6W-Yteu', // Banner 04
  '17u9CwelFE1rYhVPkOaJLn2pmVD7jYah9', // Banner 05
];
const BANNER_BUST = Date.now(); //TIME APPLIED
const bannerUrl = (id: string) => `https://drive.google.com/thumbnail?id=${id}&sz=w1600&t=${BANNER_BUST}`;
const BANNER_INTERVAL = 5500; // INTERVAL

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

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const c = (k: string, f: string) => app.appearance[k] || f;

  // --- 비즈니스 로직 훅(Hook) 호출 ---
  const { gifUri, gifAspectRatio, handleTotalPress } = useHeaderGif();
  const { checkingVersion, handleCheckVersion } = useAppVersion();
  const { 
    guardedChange, savedSelection, setSavedSelection, handleSave, handleLoad,
    sending, exporting, syncing, handleSend, executeExport, handleSync,
    sendModalVisible, setSendModalVisible, me2ve, setMe2ve, confirmSend
  } = useOrderAndCartManager();
  const { 
    importModalVisible, loadingTabs, importingTab, tabList, 
    openImportModal, closeImportModal, handleSelectTab 
  } = useImportActions();

  // Export/Import 통합 핸들러
  const handleExportOptions = async () => {
    const url = app.settings.appsScriptUrl.trim();
    if (!url) {
      notify('Setup required', 'Register the Apps Script URL in the SETTING tab first.');
      return;
    }
    if (Platform.OS === 'web') {
      if (window.confirm('Click [OK] to EXPORT or [Cancel] to IMPORT from Google Sheet')) executeExport(url);
      else openImportModal();
      return;
    }
    Alert.alert('Excel Options', 'Choose an action for Google Sheets', [
      { text: 'EXPORT', onPress: () => executeExport(url) },
      { text: 'IMPORT', onPress: openImportModal },
      { text: 'CANCEL', style: 'cancel' },
    ]);
  };

  // --- SAVED 드롭다운: 내 저장 주문 전부(스토어/벤더 무관), 최신순 ---
  const savedTotal = (s: SavedCart) => s.items.reduce((sum, it) => {
    const p = app.findByUpc(it.upc);
    const code = p?.itemCode ?? '';
    const parts = code.split('/');
    const defaultOpt = parts.length > 1 ? parts[1].trim() : '';
    const activeOpt = it.opt || defaultOpt;
    const base = p?.cost ?? 0;
    const price = activeOpt ? calcPrice(base, code, it.opt) : base;
    return sum + Number(price) * it.qty;
  }, 0);

  const fmtSavedDate = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
  };

  const savedTime = (s: SavedCart) => { const t = Date.parse(s.createdAt); return isNaN(t) ? 0 : t; };
  const savedOptions = app.savedCarts
    .filter((s) => s.userEmail === app.session?.email)
    .sort((a, b) => savedTime(b) - savedTime(a))
    .map((s) => {
      const storeName = app.stores.find((x) => x.id === s.storeId)?.name ?? '';
      const vendorName = app.vendors.find((x) => x.id === s.vendorId)?.name ?? '';
      const sublabel = [storeName, vendorName, fmtSavedDate(s.createdAt), `${s.items.length} items`, `$${savedTotal(s).toFixed(2)}`]
        .filter(Boolean)
        .join(' · ');
      return { value: s.id, label: s.name, sublabel };
    });

  // 배너 높이 = TOTAL 띠 높이 × 2 (TOTAL 띠를 실제로 재서 맞춤)
  const [bandH, setBandH] = useState(0);

  const totalColor = c('home.totalCardColor', colors.totalCard ?? colors.primary);
  const loadColor = c('home.loadColor', colors.loadBtn ?? colors.accent);
  const unitCount = app.cart.reduce((s, it) => s + it.qty, 0);
  const cartEmpty = app.cart.length === 0;
  const onBandText = colors.totalLabel ? { color: colors.totalLabel } : null;

  return (
    <View style={[styles.container, { backgroundColor: c('home.bg', colors.background), paddingTop: topPad }]}>
      
      <View style={[styles.header, { paddingHorizontal: 16, paddingTop: 0 }]}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.brand, { color: c('home.brandColor', colors.primary), fontSize: 20 * fs }]} onPress={handleCheckVersion}>
              {app.settings.appTitle}
            </Text>
            {checkingVersion && <ActivityIndicator size="small" color={colors.primary} />}
          </View>
          <Text style={[styles.userEmail, { color: colors.mutedForeground, fontSize: 12 * fs }]}>{app.session?.email}</Text>
        </View>

        {gifUri && (
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 8 }}>
            <Image source={{ uri: gifUri }} style={{ height: 45
              , maxWidth: '100%', aspectRatio: gifAspectRatio }} resizeMode="contain" />
          </View>
        )}

        <View style={styles.headerActions}>
          <Pressable onPress={handleSync} disabled={syncing} style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.5 }]} testID="sync-now">
            {syncing ? <ActivityIndicator size="small" color={colors.mutedForeground} /> : <Feather name="refresh-cw" size={20} color={colors.mutedForeground} />}
          </Pressable>
          <Pressable onPress={app.logout} style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.5 }]} testID="logout">
            <Feather name="log-out" size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      <View style={styles.body}>

        {/* TOTAL: 화면 폭 전체 띠 (TOTAL / 금액·개수 / GM·SHIP) */}
        <Pressable
          onPress={handleTotalPress}
          onLayout={(e) => setBandH(Math.round(e.nativeEvent.layout.height))}
          style={({ pressed }) => [styles.totalBand, { backgroundColor: totalColor }, pressed && { opacity: 0.95 }]}
        >
          <Text style={[styles.totalLabel, onBandText]}>{c('home.totalLabel', 'TOTAL')}</Text>
          <View style={[styles.totalRow, { alignItems: 'baseline' }]}>
            <Text style={[styles.totalValue, { fontSize: 30 * fs }]}>${app.cartTotal.toFixed(2)}</Text>
            <Text style={[styles.totalSub, { fontSize: 13 * fs }, onBandText]}>
              {app.cart.length} items · {unitCount} units
            </Text>
          </View>
          <View style={[styles.totalRow, { alignItems: 'center', marginTop: 8 }]}>
            <Pressable
              onPress={() => app.setDepartment(app.department === 'GM' ? 'PRODUCT' : 'GM')}
              style={({ pressed }) => [styles.deptPill, pressed && { backgroundColor: 'rgba(255,255,255,0.38)' }]}
              testID="department-toggle"
            >
              <Text style={[styles.shipText, { fontSize: 12 * fs, fontFamily: 'Inter_700Bold' }, onBandText]}>{app.department}</Text>
            </Pressable>
            <View style={styles.shipPill}>
              <Text style={[styles.shipText, { fontSize: 11 * fs }, onBandText]}>{c('home.shipLabel', 'SHIP TO JBS')}</Text>
              <Switch
                value={app.shipToJBS}
                onValueChange={app.setShipToJBS}
                trackColor={{ true: 'rgba(255,255,255,0.55)', false: 'rgba(0,0,0,0.18)' }}
                ios_backgroundColor="rgba(0,0,0,0.18)"
                thumbColor="#fff"
                style={styles.shipSwitch}
                testID="ship-to-jbs"
              />
            </View>
          </View>
        </Pressable>

        {/* 배너: 화면 폭 꽉 채움, 자동 + 손으로 넘김 */}
        <BannerCarousel height={bandH * 2} />

        {/* STORE / VENDOR 블록 */}
        <View style={styles.selectGroup}>
          <Dropdown
            label={c('home.storeLabel', 'STORE')}
            placeholder="Select store"
            options={app.stores.map((s) => ({ value: s.id, label: s.name, sublabel: `${s.address}` }))}
            value={app.selectedStoreId}
            onChange={(id) => guardedChange('store', id)}
            testID="select-store"
          />
          <Dropdown
            label={c('home.vendorLabel', 'VENDOR')}
            placeholder="Select vendor"
            options={app.vendors.map((v) => ({ value: v.id, label: v.name, sublabel: `${v.salesPerson} · ${v.email}` }))}
            value={app.selectedVendorId}
            onChange={(id) => guardedChange('vendor', id)}
            testID="select-vendor"
          />
          <Dropdown
            label={c('home.savedLabel', 'SAVED')}
            placeholder="Select saved order"
            options={savedOptions}
            value={savedSelection}
            onChange={setSavedSelection}
            onDeleteOption={(id) => { app.deleteSavedCart(id); if (savedSelection === id) setSavedSelection(null); }}
            testID="saved-list"
          />
        </View>

        {/* 버튼 4개: SAVED와 하단 탭 사이 세로 가운데 */}
        <View style={styles.buttonArea}>
        <View style={styles.buttonGrid}>
          <ActionButton icon={<Feather name="send" size={20} color={colors.sendBtnText ?? colors.actionBtnIcon ?? '#fff'} />} label={c('home.sendLabel', 'SEND')} color={c('home.sendColor', colors.sendBtn ?? colors.accent)} borderColor={colors.sendBtnBorder} textColor={colors.sendBtnText ?? colors.actionBtnText} onPress={handleSend} badge={app.cart.length} testID="btn-send" />
          <ActionButton icon={<MaterialCommunityIcons name="microsoft-excel" size={20} color={colors.actionBtnIcon ?? '#fff'} />} label={c('home.exportLabel', 'EXPORT')} color={c('home.exportColor', colors.exportBtn ?? colors.success)} textColor={colors.actionBtnText} onPress={handleExportOptions} testID="btn-export" />
          <ActionButton icon={<Feather name="save" size={20} color={colors.actionBtnIcon ?? '#fff'} />} label={c('home.saveLabel', 'SAVE')} color={c('home.saveColor', colors.saveBtn ?? colors.primary)} borderColor={colors.saveBtnBorder} textColor={colors.actionBtnText} onPress={handleSave} testID="btn-save" />
          <ActionButton icon={<Feather name="download" size={20} color={colors.actionBtnIcon ?? '#fff'} />} label={c('home.loadLabel', 'LOAD')} color={loadColor} textColor={colors.actionBtnText} onPress={handleLoad} highlight={!!savedSelection} ringColor={loadColor} badge={savedOptions.length} testID="btn-load" />
        </View>
        </View>

      </View>

      {/* 분리된 모달 컴포넌트들 */}
      <ProgressModal visible={sending} title="Sending Order…" subtitle="Please wait. Do not close the app." />
      <ProgressModal visible={exporting} title="Exporting To GOOGLE SHEET…" subtitle="Please wait. Do not close the app." />
      <ImportTabsModal visible={importModalVisible} onClose={closeImportModal} loadingTabs={loadingTabs} importingTab={importingTab} tabList={tabList} onSelectTab={handleSelectTab} />
      
      <SendConfirmModal 
        visible={sendModalVisible} 
        onClose={() => setSendModalVisible(false)} 
        onConfirm={confirmSend}
        me2ve={me2ve}
        setMe2ve={setMe2ve}
      />
    </View>
  );
}

function ProgressModal({ visible, title, subtitle }: { visible: boolean; title: string; subtitle: string; }) {
  const colors = useColors();
  const fs = useFontScale();
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.sendingOverlay}>
        <View style={[styles.sendingBox, { backgroundColor: colors.card }]}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={[styles.sendingTitle, { color: colors.text, fontSize: 18 * fs }]}>{title}</Text>
          <Text style={[styles.sendingSub, { color: colors.muted, fontSize: 14 * fs }]}>{subtitle}</Text>
        </View>
      </View>
    </Modal>
  );
}

function ImportTabsModal({ visible, onClose, loadingTabs, importingTab, tabList, onSelectTab }: { visible: boolean; onClose: () => void; loadingTabs: boolean; importingTab: boolean; tabList: string[]; onSelectTab: (t: string) => void; }) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.sendingOverlay}>
        <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Select Sheet Tab to Import</Text>
            <Pressable onPress={onClose} style={{ padding: 4 }}>
              <Feather name="x" size={20} color={colors.text} />
            </Pressable>
          </View>
          {loadingTabs || importingTab ? (
            <View style={{ paddingVertical: 30, alignItems: 'center', gap: 10 }}>
              <ActivityIndicator size="large" color={colors.tint} />
              <Text style={{ color: colors.muted }}>{importingTab ? 'Loading Tab Data…' : 'Fetching Sheet Tabs…'}</Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 300, marginVertical: 10 }}>
              {tabList.length === 0 ? (
                <Text style={{ textAlign: 'center', color: colors.muted, marginVertical: 20 }}>No tabs found.</Text>
              ) : (
                tabList.map((tab) => (
                  <Pressable key={tab} onPress={() => onSelectTab(tab)} style={({ pressed }) => [styles.tabItem, { borderColor: colors.border }, pressed && { backgroundColor: colors.border }]}>
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
  );
}

// 버튼 색을 조금 어둡게 만든 색 (키캡 받침용). hex가 아니면 반투명 검정 사용
function shadeColor(color: string, amount = 0.28) {
  let hex = color.trim();
  if (/^#[0-9a-f]{3}$/i.test(hex)) hex = '#' + hex.slice(1).split('').map((ch) => ch + ch).join('');
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex);
  if (!m) return 'rgba(0,0,0,0.25)';
  const n = parseInt(m[1], 16);
  const f = (v: number) => Math.max(0, Math.round(v * (1 - amount)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function ActionButton({
  icon, label, color, borderColor, textColor, onPress, testID, highlight, ringColor, dim, badge,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
  borderColor?: string;
  textColor?: string;
  onPress: () => void;
  testID?: string;
  highlight?: boolean; // SAVED에서 주문을 고르면 LOAD에 링 표시
  ringColor?: string;
  dim?: boolean; // 지금 누를 일이 없으면 흐리게 (누르면 기존 안내가 뜸)
  badge?: number; // 오른쪽 위 숫자 배지 (0이면 숨김)
}) {
  const fs = useFontScale();
  const colors = useColors();
  const press = useRef(new Animated.Value(0)).current;
  const animate = (to: number) =>
    Animated.timing(press, { toValue: to, duration: 90, useNativeDriver: true }).start();
  const translateY = press.interpolate({ inputRange: [0, 1], outputRange: [0, 3] });
  const iconScale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] });

  return (
    <View style={[styles.actionWrap, dim && styles.actionDim]}>
      {highlight && <View pointerEvents="none" style={[styles.actionRing, { borderColor: ringColor ?? color }]} />}
      <View pointerEvents="none" style={[styles.actionBase, { backgroundColor: shadeColor(color) }]} />
      <Animated.View style={{ transform: [{ translateY }] }}>
        <Pressable
          onPress={onPress}
          onPressIn={() => animate(1)}
          onPressOut={() => animate(0)}
          testID={testID}
          style={[
            styles.actionBtn,
            { backgroundColor: color },
            borderColor ? { borderWidth: StyleSheet.hairlineWidth, borderColor } : null,
          ]}
        >
          <Animated.View style={{ transform: [{ scale: iconScale }] }}>{icon}</Animated.View>
        </Pressable>
      </Animated.View>
      {badge ? (
        <View pointerEvents="none" style={[styles.actionBadge, { borderColor: colors.background }]}>
          <Text style={[styles.actionBadgeText, { color: colors.foreground, fontSize: 11 * fs }]}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

function BannerCarousel({ height }: { height: number }) {
  const { width } = useWindowDimensions();
  const [failed, setFailed] = useState<string[]>([]);
  const ids = BANNER_IDS.filter((id) => !failed.includes(id));
  const loop = ids.length > 1;
  // 앞뒤 복제: [5] 1 2 3 4 5 [1]  → 끝에서 진짜 쪽으로 순간 점프
  const slides = loop ? [ids[ids.length - 1], ...ids, ids[0]] : ids;
  const [index, setIndex] = useState(0); // 점 표시용 진짜 번호 (0..n-1)
  const scrollRef = useRef<ScrollView>(null);
  const posRef = useRef(loop ? 1 : 0); // slides 안에서의 위치
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fixTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const realOf = (pos: number) => (loop ? (pos - 1 + ids.length) % ids.length : pos);

  const jump = (pos: number) => {
    scrollRef.current?.scrollTo({ x: pos * width, animated: false });
    posRef.current = pos;
  };

  // 복제 칸에 멈추면 진짜 칸으로 애니메이션 없이 이동
  const settle = (x: number) => {
    let pos = Math.max(0, Math.min(slides.length - 1, Math.round(x / width)));
    if (loop && pos === 0) { pos = ids.length; jump(pos); }
    else if (loop && pos === ids.length + 1) { pos = 1; jump(pos); }
    posRef.current = pos;
    setIndex(realOf(pos));
  };

  const stop = () => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (fixTimer.current) { clearTimeout(fixTimer.current); fixTimer.current = null; }
  };
  const start = () => {
    stop();
    if (!loop) return;
    timer.current = setInterval(() => {
      const next = posRef.current + 1;
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
      posRef.current = next;
      setIndex(realOf(next));
      if (next === ids.length + 1) {
        fixTimer.current = setTimeout(() => jump(1), 450); // 복제 [1] 도착 후 진짜 1로
      }
    }, BANNER_INTERVAL);
  };

  useEffect(() => {
    posRef.current = loop ? 1 : 0;
    setIndex(0);
    jump(posRef.current);
    start();
    return stop;
  }, [ids.length, width]);

  if (ids.length === 0 || height <= 0) return null; // 그림이 없거나 TOTAL 높이 측정 전이면 숨김

  return (
    <View style={{ width, height, marginTop: 4 }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={32}
        onContentSizeChange={() => jump(posRef.current)}
        onScroll={(e) => {
          const p = Math.max(0, Math.min(slides.length - 1, Math.round(e.nativeEvent.contentOffset.x / width)));
          setIndex(realOf(p));
        }}
        onScrollBeginDrag={stop}
        onScrollEndDrag={start}
        onMomentumScrollEnd={(e) => { settle(e.nativeEvent.contentOffset.x); start(); }}
      >
        {slides.map((id, i) => (
          <Image
            key={`${i}-${id}`}
            source={{ uri: bannerUrl(id) }}
            style={{ width, height }}
            resizeMode="cover"
            onError={() => setFailed((f) => (f.includes(id) ? f : [...f, id]))}
          />
        ))}
      </ScrollView>
      {loop && (
        <View pointerEvents="none" style={styles.bannerDots}>
          {ids.map((id, i) => (
            <View key={id} style={[styles.bannerDot, i === index && styles.bannerDotOn]} />
          ))}
        </View>
      )}
    </View>
  );
}

function useHeaderGif() {
  const [gifUri, setGifUri] = useState<string | null>(null);
  const [gifAspectRatio, setGifAspectRatio] = useState<number | undefined>(undefined);
  const [tapCount, setTapCount] = useState<number>(0);

  useEffect(() => { AsyncStorage.getItem('header_custom_gif').then((uri) => { if (uri) setGifUri(uri); }); }, []);
  useEffect(() => {
    if (gifUri) Image.getSize(gifUri, (width, height) => { if (width && height) setGifAspectRatio(width / height); }, () => setGifAspectRatio(undefined));
    else setGifAspectRatio(undefined);
  }, [gifUri]);

  const pickGif = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 1 });
      if (!result.canceled && result.assets && result.assets[0]) {
        setGifUri(result.assets[0].uri);
        await AsyncStorage.setItem('header_custom_gif', result.assets[0].uri);
      }
    } catch (e) { notify('Error', 'GIF 이미지를 불러오는데 실패했습니다.'); }
  };

  const handleTotalPress = () => {
    const nextCount = tapCount + 1;
    if (nextCount >= 5) {
      setTapCount(0);
      if (gifUri) {
        if (Platform.OS === 'web') {
          if (window.confirm('GIF가 이미 등록되어 있습니다. 새로운 GIF를 선택하시겠습니까?\n(취소 누르면 기존 GIF 삭제)')) pickGif();
          else { setGifUri(null); AsyncStorage.removeItem('header_custom_gif'); }
        } else {
          Alert.alert('GIF', 'IMAGE SELECTION', [
            { text: 'NEW', onPress: pickGif },
            { text: 'DELETE', style: 'destructive', onPress: async () => { setGifUri(null); await AsyncStorage.removeItem('header_custom_gif'); } },
            { text: 'CANCEL', style: 'cancel' },
          ]);
        }
      } else pickGif();
    } else setTapCount(nextCount);
  };
  return { gifUri, gifAspectRatio, handleTotalPress };
}

function useAppVersion() {
  const app = useApp();
  const [checkingVersion, setCheckingVersion] = useState(false);
  const handleCheckVersion = async () => {
    if (checkingVersion) return;
    const url = app.settings.appsScriptUrl?.trim();
    if (!url) return notify('Notice', 'Apps Script URL is not set.');
    setCheckingVersion(true);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'checkUpdate', v: app.appVersion }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => ({}));
      if (data && data.latestVersion) {
        if (data.latestVersion > app.appVersion) {
          const ok = await confirmAsync('Update Available', `Latest Version (${data.latestVersion})is available.\nDownload it now?`);
          if (ok && data.downloadUrl) Linking.openURL(data.downloadUrl);
        } else notify('Lastest Version Installed', 'App is up to date');
      } else notify('No Updates', 'No APK available');
    } catch (e: any) { notify('Server Error', `Response:\n${e?.message ?? ''}`); } 
    finally { setCheckingVersion(false); }
  };
  return { checkingVersion, handleCheckVersion };
}

function useOrderAndCartManager() {
  const app = useApp();
  const [savedSelection, setSavedSelection] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sendModalVisible, setSendModalVisible] = useState(false);
  const [me2ve, setMe2ve] = useState('');

  const store = app.stores.find((s) => s.id === app.selectedStoreId);
  const vendor = app.vendors.find((v) => v.id === app.selectedVendorId);

  const requireReady = () => {
    if (!app.selectedStoreId) { notify('Notice', 'Select a store'); return false; }
    if (!app.selectedVendorId) { notify('Notice', 'Select a vendor'); return false; }
    if (app.cart.length === 0) { notify('Notice', 'Cart is empty'); return false; }
    return true;
  };

  const handleSave = () => {
    if (!requireReady()) return;
    const saved = app.saveCart();
    if (saved) notify('Saved', saved.name);
  };

  const handleLoad = () => {
    if (!savedSelection) return notify('Notice', 'Select a saved order to load');
    if (app.cart.length > 0) {
      const saved = app.saveCart();
      if (saved) notify('Auto-saved', `Current cart saved as:\n${saved.name}`);
    }
    app.loadCart(savedSelection);
    setSavedSelection(null);
    notify('Loaded', 'Saved order moved into cart');
  };

  const guardedChange = (kind: 'store' | 'vendor', id: string | null) => {
    const current = kind === 'store' ? app.selectedStoreId : app.selectedVendorId;
    const apply = () => { if (kind === 'store') app.setSelectedStoreId(id); else app.setSelectedVendorId(id); };
    if (app.cart.length === 0 || id === current) return apply();

    if (kind === 'vendor') {
      const saved = app.saveCart();
      if (saved) notify('Auto-saved', `Cart saved as:\n${saved.name}`); else app.clearCart();
      return apply();
    }
    const doSave = () => { const saved = app.saveCart(); if (saved) notify('Cart saved', saved.name); apply(); };
    const doChange = () => apply();

    if (Platform.OS === 'web') {
      if (window.confirm('Cart has items.\n\nSave the cart before changing store?\n(Cancel = more options)')) doSave();
      else if (window.confirm('Change store and keep the cart as is?\n(Cancel = keep current store)')) doChange();
      return;
    }
    Alert.alert('Cart has items', 'What would you like to do?', [{ text: 'SAVE CART', onPress: doSave }, { text: 'CHANGE STORE', onPress: doChange }, { text: 'CANCEL', style: 'cancel' }]);
  };

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try { const res = await app.syncFromSheets(); if (!res.ok) notify('Sync failed', res.message); } 
    finally { setSyncing(false); }
  };

  const buildOrderPayload = (msg: string = '') => {
    const items = app.cart.map((c) => {
      const p = app.findByUpc(c.upc);
      const originalItemCode = p?.itemCode ?? '';
      const parts = originalItemCode.split('/');
      const baseCode = parts[0].trim();
      const defaultOpt = parts.length > 1 ? parts[1].trim() : '';
      const activeOpt = c.opt || defaultOpt;
      const finalItemCode = activeOpt ? `${baseCode} / ${activeOpt}` : baseCode;
      const baseCost = p?.cost ?? 0;
      const finalPrice = activeOpt ? calcPrice(baseCost, originalItemCode, c.opt) : baseCost;
      return { upc: c.upc, itemCode: finalItemCode, description: p?.description ?? '', cost: finalPrice, qty: c.qty, amount: Number(finalPrice) * c.qty };
    });
    return {
      v: app.appVersion, type: 'order', store: store?.name ?? '',
      storeAddress: app.shipToJBS ? app.stores.find((s) => s.name.startsWith('JBS'))?.address ?? '' : store?.address ?? '',
      shipToJBS: app.shipToJBS, department: app.department, vendor: vendor?.name ?? '', vendorEmail: vendor?.email ?? '', user: app.session?.email ?? '',
      total: app.cartTotal, createdAt: new Date().toISOString(), jorderid: app.generateJOrderId(), items, me2ve: msg,
    };
  };

  const handleSend = () => {
    if (!requireReady()) return;
    const url = app.settings.appsScriptUrl.trim();
    if (!url) return notify('Setup required', 'Register the Apps Script URL in the SETTING tab first.\nOrders cannot be sent until it is set.');
    setMe2ve(''); // 모달을 열기 전 입력값 초기화
    setSendModalVisible(true);
  };

  const confirmSend = async () => {
    setSendModalVisible(false);
    const url = app.settings.appsScriptUrl.trim();
    setSending(true);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(buildOrderPayload(me2ve)) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => ({}));
      setSending(false);
      if (data?.busy) return notify('Server busy', '서버에서 다른 일 처리 중에 있습니다.\n잠시 후에 다시 시도해 주세요.');
      if (data?.ok === false) return notify('Send failed', `An error occurred while sending the order.\n${data.error ?? ''}`);
      if (data && data.emailed === false) {
        notify('Sent', `${vendor?.name}, Total $${app.cartTotal.toFixed(2)}\n${data.emailNote || ''}`);
      } else {
        notify('Sent', `${vendor?.name}, Total $${app.cartTotal.toFixed(2)}\n${data.emailNote || ''}`);
      }
      app.clearCart();
    } catch (e: any) { setSending(false); notify('Send failed', `An error occurred while sending the order.\n${e?.message ?? ''}`); }
  };

  const executeExport = async (url: string) => {
    if (!requireReady()) return;
    const ok = await confirmAsync('Export', `Export ${vendor?.name ?? ''} order?`);
    if (!ok) return;
    setExporting(true);
    try {
      const payload = { ...buildOrderPayload(), action: 'export' };
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => ({}));
      setExporting(false);
      if (data?.busy) return notify('Server busy', 'Server is processing another export.\nPlease try again shortly.');
      if (data?.ok === false) return notify('Export failed', data.error ?? 'Unknown error');
      notify('Export Complete', `${vendor?.name ?? ''} exported successfully.`);
      app.clearCart();
    } catch (e: any) { setExporting(false); notify('Export failed', e?.message ?? 'Unknown error'); }
  };

  return { guardedChange, savedSelection, setSavedSelection, handleSave, handleLoad, sending, exporting, syncing, handleSend, executeExport, handleSync, sendModalVisible, setSendModalVisible, me2ve, setMe2ve, confirmSend };
}

function useImportActions() {
  const app = useApp();
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [loadingTabs, setLoadingTabs] = useState(false);
  const [tabList, setTabList] = useState<string[]>([]);
  const [importingTab, setImportingTab] = useState(false);

  const openImportModal = async () => {
    setLoadingTabs(true); setImportModalVisible(true);
    try {
      if (app.getTabList) {
        const res = await app.getTabList();
        if (res.ok && res.tabs) setTabList(res.tabs);
        else { notify('Failed', res.message || 'Failed to fetch sheet tabs'); setImportModalVisible(false); }
      }
    } catch (e: any) { notify('Failed', e?.message ?? 'Failed to connect server'); setImportModalVisible(false); } 
    finally { setLoadingTabs(false); }
  };

  const handleSelectTab = async (tabName: string) => {
    if (app.cart.length > 0) {
      const saved = app.saveCart();
      if (saved) notify('Auto-saved', `Current cart auto-saved as:\n${saved.name}`);
    }
    setImportingTab(true);
    try {
      if (app.importFromSheet) {
        const res = await app.importFromSheet(tabName);
        if (res.ok) { notify('Import Success', `Loaded sheet tab: ${tabName}`); setImportModalVisible(false); } 
        else notify('Import Failed', res.message || 'Failed to import tab data');
      }
    } catch (e: any) { notify('Import Failed', e?.message ?? 'Failed to import tab data'); } 
    finally { setImportingTab(false); }
  };

  return { importModalVisible, loadingTabs, importingTab, tabList, openImportModal, closeImportModal: () => setImportModalVisible(false), handleSelectTab };
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sendingOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  sendingBox: { borderRadius: 16, paddingVertical: 28, paddingHorizontal: 36, alignItems: 'center', gap: 12, minWidth: 240 },
  modalBox: { width: '85%', maxWidth: 400, borderRadius: 16, padding: 20, elevation: 5 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { fontSize: 16, fontWeight: '700' },
  tabItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  tabText: { fontSize: 14, fontWeight: '500' },
  sendingTitle: { fontWeight: '700' },
  sendingSub: { textAlign: 'center' },
  body: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  brand: { fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  userEmail: { fontFamily: 'Inter_400Regular', marginTop: 2 },
  logoutBtn: { padding: 8 },
  // TOTAL 띠
  totalBand: { paddingHorizontal: 16, paddingVertical: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  deptPill: { height: 30, paddingHorizontal: 14, borderRadius: 15, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.22)' },
  totalLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 3 },
  totalValue: { color: '#fff', fontFamily: 'Inter_700Bold', marginTop: 2 },
  totalSub: { color: 'rgba(255,255,255,0.85)', fontFamily: 'Inter_500Medium' },
  shipPill: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 30, paddingLeft: 11, paddingRight: 2, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.18)' },
  shipText: { color: '#fff', fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
  shipSwitch: { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] },
  // 배너
  bannerDots: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.38)' },
  bannerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  bannerDotOn: { width: 16, backgroundColor: '#fff' },
  // STORE / VENDOR
  selectGroup: { gap: 5, marginTop: 10 },
  section: { marginBottom: 12 },
  sectionLabel: { fontSize: 11, fontFamily: 'Inter_700SemiBold', letterSpacing: 1.2, marginBottom: 6 },
  toggleRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 10, paddingHorizontal: 2 },
  toggleLabel: { fontFamily: 'Inter_500Medium' },
  // 버튼 4개
  buttonArea: { flex: 1, justifyContent: 'center', paddingTop: 6, paddingBottom: 72 },
  buttonGrid: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, transform: [{ translateY: -20 }] },
  actionWrap: { flex: 1, paddingBottom: 4 },
  actionDim: { opacity: 0.42 },
  actionRing: { position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderRadius: 20, borderWidth: 2 },
  actionBase: { position: 'absolute', top: 4, left: 0, right: 0, bottom: 0, borderRadius: 16 },
  actionBtn: { aspectRatio: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  actionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.35)' },
  actionLabel: { color: '#fff', fontFamily: 'Inter_700Bold', letterSpacing: 0.8, paddingHorizontal: 4 },
  actionBadge: { position: 'absolute', top: -7, right: -5, minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, borderWidth: 2, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  actionBadgeText: { fontFamily: 'Inter_700Bold' },
});

function SendConfirmModal({
  visible, onClose, onConfirm, me2ve, setMe2ve
}: {
  visible: boolean; onClose: () => void; onConfirm: () => void; me2ve: string; setMe2ve: (t: string) => void;
}) {
  const colors = useColors();
  const fs = useFontScale();
  const app = useApp();
  const vendor = app.vendors.find((v) => v.id === app.selectedVendorId);

  return (
    <Modal visible={visible} transparent animationType="fade">
      {/* 1. 최상단을 KeyboardAvoidingView로 감싸고 꽉 찬 화면(flex: 1) 부여 */}
      <KeyboardAvoidingView 
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* 2. ScrollView로 래핑하여 키보드 활성화 시 컨텐츠가 위로 밀릴 수 있도록 설정 */}
        <ScrollView
          style={{ flex: 1, width: '100%' }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* 3. 빈 화면 터치 시 키보드를 닫기 위한 TouchableWithoutFeedback */}
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }}>
              
              {/* 모달 내부(입력창 및 버튼 영역) 터치 시 이벤트 전파를 막아 키보드가 닫히지 않도록 빈 래퍼 추가 */}
              <TouchableWithoutFeedback>
                <View style={[styles.modalBox, { backgroundColor: colors.card, minWidth: 280, width: '100%' }]}>
                  <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 10, textAlign: 'center' }]}>
                    Send Order
                  </Text>
                  <Text style={{ color: colors.text, fontSize: 14 * fs, textAlign: 'center', marginBottom: 20 }}>
                    Send {vendor?.name ?? ''} order?{'\n'}Total ${app.cartTotal.toFixed(2)}
                  </Text>
                  
                  <Text style={{ color: colors.mutedForeground, fontSize: 11 * fs, fontWeight: '700', marginBottom: 6, letterSpacing: 1 }}>
                    [MESSAGE]
                  </Text>
                  <TextInput
                    style={{
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: colors.border,
                      borderRadius: 8,
                      padding: 12,
                      color: colors.text,
                      minHeight: 44,
                      marginBottom: 24,
                      backgroundColor: colors.background
                    }}
                    placeholder=""
                    placeholderTextColor='#E0E0E0'
                    value={me2ve}
                    onChangeText={setMe2ve}
                  />

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Pressable onPress={onClose} style={({ pressed }) => [{ flex: 1, paddingVertical: 14, borderRadius: 8, backgroundColor: colors.border, alignItems: 'center' }, pressed && { opacity: 0.8 }]}>
                      <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 * fs }}>CANCEL</Text>
                    </Pressable>
                    <Pressable onPress={onConfirm} style={({ pressed }) => [{ flex: 1, paddingVertical: 14, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center' }, pressed && { opacity: 0.8 }]}>
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 * fs }}>SEND</Text>
                    </Pressable>
                  </View>
                </View>
              </TouchableWithoutFeedback>
              
            </View>
          </TouchableWithoutFeedback>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}