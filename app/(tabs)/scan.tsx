import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@/components/AppIcon';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useApp, useFontScale, Product } from '@/context/AppContext';
import ItemCard from '@/components/ItemCard';

export default function ScanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const fs = useFontScale();
  const app = useApp();
  const c = (k: string, f: string) => app.appearance[k] || f;
  const [cameraOn, setCameraOn] = useState(false);
  const userTurnedOffRef = useRef(false); // 사용자가 직접 끈 경우 자동 켜짐 방지
  const [isFocused, setIsFocused] = useState(false); // SCAN 탭이 화면에 보일 때만 카메라 가동
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );
  const [keyword, setKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<Product[] | null>(null);
  const [scanMsg, setScanMsg] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const lastScanRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const flatListRef = useRef<FlatList>(null);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  // 스토어/벤더 변경 또는 카트 저장(SAVE) 시 검색 결과 초기화
  useEffect(() => {
    setKeyword('');
    setSearchResults(null);
  }, [app.selectedStoreId, app.selectedVendorId, app.savedCarts.length]);

  const handleBarcode = useCallback(
    ({ data }: { data: string }) => {
      data = data.replace(/^0+/, '');
      const now = Date.now();
      if (
        lastScanRef.current.code === data &&
        now - lastScanRef.current.at < 3000    //연속 스캔 방지 초
      )
        return;
      lastScanRef.current = { code: data, at: now };

      if (!app.selectedStoreId || !app.selectedVendorId) {
        setScanMsg('✗ Select store and vendor on HOME first');
        setTimeout(() => setScanMsg(''), 2500);
        return;
      }

      // every scan clears any previous search so old results don't linger
      setKeyword('');
      setSearchResults(null);

      //여기 중복 바코드 처리
      const matchingProducts = app.findAllByUpc(data);
      const productInCurrent = matchingProducts.find(
        (p) => p.vendorId === app.selectedVendorId
      );
      
      // 케이스 2: 다른 벤더에만 존재
      if (!productInCurrent && matchingProducts.length > 0) {
        if (Platform.OS !== 'web')
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        setScanMsg(`✗ Not in selected vendor: ${matchingProducts[0].description}`);
        setTimeout(() => setScanMsg(''), 2500);
        return;
      }

      // 케이스 1: 현재 벤더에만 존재
      // 케이스 3: 현재 벤더 + 다른 벤더에도 존재
      if (productInCurrent) {

        if (Platform.OS !== 'web')
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

        app.addToScanList(productInCurrent.upc);
        setScanMsg(`✓ ${productInCurrent.description}`);
      }
      // 케이스 4: 전체 DB에 없음
      else {
        if (Platform.OS !== 'web')
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        setScanMsg(`✗ Unknown barcode: ${data}`);
      }

      setTimeout(() => setScanMsg(''), 2500);
    },
    [app],
  );

  const toggleCamera = async () => {
    if (!cameraOn && !(app.selectedStoreId && app.selectedVendorId)) {
      setScanMsg('✗ Select store and vendor on HOME first');
      setTimeout(() => setScanMsg(''), 2500);
      return;
    }
    if (!cameraOn) {
      if (!permission?.granted) {
        const res = await requestPermission();
        if (!res.granted) return;
      }
      userTurnedOffRef.current = false;
      setCameraOn(true);
    } else {
      userTurnedOffRef.current = true;
      setCameraOn(false);
    }
  };

  // 카메라 디폴트 ON: 스토어/벤더 선택돼 있으면 자동으로 켬 (직접 끈 경우 제외)
  useEffect(() => {
    if (cameraOn || userTurnedOffRef.current) return;
    if (!(app.selectedStoreId && app.selectedVendorId)) return;
    (async () => {
      if (!permission?.granted) {
        const res = await requestPermission();
        if (!res.granted) return;
      }
      setCameraOn(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.selectedStoreId, app.selectedVendorId, permission?.granted]);

  const ready = !!app.selectedStoreId && !!app.selectedVendorId;

  const handleSearch = (kw: string) => {
    if (!ready) return;
    setKeyword(kw);
    const q = kw;
    if (q.length >= 2) setSearchResults(app.searchProducts(kw));
    else if (q.length === 1) setSearchResults([]); // typing — show nothing yet
    else setSearchResults(null); // empty box — back to the scanned list
  };

  const handleRelated = (p: Product) => {
    const rel = app.relatedItems(p);
    setKeyword(`Related: #${p.itemCode}`);
    setSearchResults(rel);
    // ▼ 새 결과가 리스트위 맨위로 이동
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const params = useLocalSearchParams();
  
  useEffect(() => {
    if (params.relatedUpc) {
      // 파라미터로 넘어온 바코드(UPC)로 상품을 찾습니다.
      const p = app.findByUpc(params.relatedUpc as string);
      if (p) {
        handleRelated(p); // 찾은 상품으로 연관 검색을 강제 실행합니다.
      }
      // 소비한 파라미터는 지워줍니다. (나중에 똑같은 상품을 또 눌렀을 때를 대비)
      router.setParams({ relatedUpc: '' });
    }
  }, [params.relatedUpc, app]);

const listData = React.useMemo(() => {
  if (searchResults !== null) return searchResults;

  return app.scanList
    .map((upc) =>
      app.findAllByUpc(upc).find(
        (p) => p.vendorId === app.selectedVendorId
      )
    )
    .filter((p): p is Product => !!p);
}, [searchResults, app.scanList, app.selectedVendorId]);


  return (
    <View style={[styles.container, { backgroundColor: c('scan.bg', colors.background) }]}>
      {/* frozen top panel */}
      <View style={[styles.topPanel, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>TOTAL</Text>
          <Text style={[styles.totalValue, { color: colors.primary, fontSize: 22 * fs }]}>
            ${app.cartTotal.toFixed(2)}
          </Text>
          <View style={[styles.vendorBadge, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Text
              style={[
                styles.vendorBadgeText,
                { color: app.selectedVendorId ? colors.accent : colors.mutedForeground },
              ]}
              numberOfLines={1}
            >
              {app.vendors.find((v) => v.id === app.selectedVendorId)?.name ?? 'NO VENDOR'}
            </Text>
          </View>
          <Pressable
            onPress={toggleCamera}
            style={({ pressed }) => [
              styles.cameraToggle,
              { backgroundColor: cameraOn ? colors.accent : colors.secondary },
              pressed && { opacity: 0.7 },
            ]}
            testID="camera-toggle"
          >
            <MaterialCommunityIcons
              name={cameraOn ? 'camera' : 'camera-off'}
              size={18}
              color={cameraOn ? '#fff' : colors.secondaryForeground}
            />
            <Text
              style={[
                styles.cameraToggleText,
                { color: cameraOn ? '#fff' : colors.secondaryForeground },
              ]}
            >
              {cameraOn ? 'ON' : 'OFF'}
            </Text>
          </Pressable>
        </View>

        {cameraOn && isFocused && (
          <View style={styles.cameraBox}>
            {Platform.OS === 'web' ? (
              <View style={[styles.webCameraFallback, { backgroundColor: colors.muted }]}>
                <MaterialCommunityIcons name="barcode-scan" size={32} color={colors.mutedForeground} />
                <Text style={[styles.webCameraText, { color: colors.mutedForeground }]}>
                  Barcode scanning works on your phone{'\n'}Type a UPC in the search box below
                </Text>
              </View>
            ) : (
              <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: ['upc_a', 'upc_e', 'ean13', 'ean8', 'code128', 'code39'],
                }}
                onBarcodeScanned={handleBarcode}
              />
            )}
            {!!scanMsg && (
              <View style={[styles.scanMsg, { backgroundColor: scanMsg.startsWith('✓') ? colors.success : colors.destructive }]}>
                <Text style={styles.scanMsgText} numberOfLines={1}>{scanMsg}</Text>
              </View>
            )}
          </View>
        )}

        <View style={[styles.searchBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            value={keyword}
            onChangeText={handleSearch}
            placeholder={ready ? c('scan.placeholder', 'Search name, #code, or UPC') : 'Select store & vendor on HOME first'}
            editable={ready}
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            style={[styles.searchInput, { color: colors.foreground, fontSize: 14 * fs }]}
            testID="search-input"
          />
          {keyword.length > 0 && (
            <Pressable onPress={() => { setKeyword(''); setSearchResults(null); }}>
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
      </View>

      <FlatList
        ref={flatListRef}  //리모컨 장착
        data={listData}
        // index를 추가해 강제로 완벽한 고유 키값 생성
        keyExtractor={(p, index) => `${p.upc}-${index}`}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ItemCard
          product={item}
          onRelated={handleRelated}
          onDelete={(upc, opt) => app.removeFromScanList(upc, opt)}
      />
  )}
      initialNumToRender={8}
      maxToRenderPerBatch={6}
      windowSize={7}
      removeClippedSubviews={Platform.OS === 'android'}
      
      ListEmptyComponent={
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name="barcode-scan" size={44} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground, fontSize: 14 * fs }]}>
              {searchResults !== null
                ? app.selectedVendorId
                  ? 'No search results'
                  : 'Select a vendor on HOME first'
                : c('scan.emptyText', 'Scan a barcode or search\nto add items')}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topPanel: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  totalRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  totalLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.2 },
  totalValue: { flex: 1, fontFamily: 'Inter_700Bold' },
  vendorBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
    maxWidth: 120,
  },
  vendorBadgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
  cameraToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  cameraToggleText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  cameraBox: { borderRadius: 12, overflow: 'hidden', marginBottom: 10, height: 180 },
  camera: { flex: 1 },
  webCameraFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  webCameraText: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 18 },
  scanMsg: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  scanMsgText: { color: '#fff', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
  },
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', padding: 0 },
  list: { paddingTop: 12, paddingBottom: 120 },
  emptyBox: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
});
