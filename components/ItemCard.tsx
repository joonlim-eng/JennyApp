import React, { useState, memo } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useApp, useFontScale, Product } from '@/context/AppContext';
import { Feather, MaterialCommunityIcons } from '@/components/AppIcon';
import * as Haptics from 'expo-haptics';
import { resolveImageUrl } from '@/lib/driveImage';
import ImageViewerModal from '@/components/ImageViewerModal';

// --- 파싱 및 단가 계산 유틸 함수 ---
function parseItemOptions(itemCode: string) {
  const parts = itemCode.split('/');
  if (parts.length < 2) return { baseCode: itemCode.trim(), options: [] };
  const baseCode = parts[0].trim();
  const options = parts.slice(1).map((p) => p.trim()).filter(Boolean);
  return { baseCode, options };
}

function getMultiplier(option: string) {
  const match = option.match(/\((\d+)\)/);
  return match ? parseInt(match[1], 10) : 1;
}

function calcPrice(cost: number, itemCode: string, selectedOpt?: string) {
  const { options } = parseItemOptions(itemCode);
  if (options.length === 0) return cost;
  
  const baseMult = getMultiplier(options[0]);
  const unitPrice = cost / baseMult;
  const targetMult = selectedOpt ? getMultiplier(selectedOpt) : baseMult;
  
  return unitPrice * targetMult;
}

interface Props {
  product: Product;
  onRelated: (p: Product) => void;
  onDelete?: (upc: string, opt?: string) => void;
  showQty?: boolean;
  cartOption?: string; // 카트 화면용 고정 옵션
}

function haptic() { 
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

// 1. 방어막이 쳐진 알맹이 UI (내 수량(qty)이 바뀌지 않으면 절대 다시 그리지 않음)
  const MemoizedCard = memo(({
  product, onRelated, onDelete, showQty = true, cartOption, qty, step, colors, fs, onSetQty, selectedOpt, onSelectOpt
  }: Props & { qty: number; step: number; colors: any; fs: number; onSetQty: (upc: string, q: number) 
  => void; selectedOpt?: string; onSelectOpt: (upc: string, opt: string) => void }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [qtyModalOpen, setQtyModalOpen] = useState(false);
  const [qtyInput, setQtyInput] = useState('');
  const qtyInputRef = React.useRef<TextInput>(null);

  const openQtyModal = () => {
    haptic();
    setQtyInput(qty > 0 ? String(qty) : '');
    setQtyModalOpen(true);
  };

  const confirmQtyInput = () => {
    const n = parseInt(qtyInput.replace(/[^0-9]/g, ''), 10);
    if (!n || n <= 0) return;
    onSetQty(product.upc, n);
    setQtyModalOpen(false);
  };

  const imageUri = resolveImageUrl(product.imageUrl);
  const fullImageUri = resolveImageUrl(product.imageUrl, 'w1000');

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.imageColumn}>
        <Pressable
          onPress={() => {
            if (imageUri && !imageFailed) {
              haptic();
              setViewerOpen(true);
            }
          }}
          style={[styles.imageBox, { backgroundColor: colors.muted }]}
          testID={`image-${product.upc}`}
        >
          {imageUri && !imageFailed ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.image}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <MaterialCommunityIcons name="package-variant-closed" size={28} color={colors.mutedForeground} />
          )}
        </Pressable>

        {/* 슬래시가 있는 경우에만 표시되는 패키지 드롭다운 버튼 */}
        {(() => {
          const { options } = parseItemOptions(product.itemCode);
          if (options.length === 0) return null;
          
          const isCart = cartOption !== undefined;
          
          return (
            <Pressable
              onPress={() => {
                if (isCart) return;
                haptic();
                const currentIndex = options.indexOf(selectedOpt || options[0]);
                const nextIndex = (currentIndex + 1) % options.length;
                onSelectOpt(product.upc, options[nextIndex]);
              }}
              disabled={isCart}
              style={[
                styles.dropdownBtn,
                // maxWidth: 64 를 추가하여 위쪽 이미지 크기와 맞추고 버튼이 좌우로 팽창하는 것을 막습니다.
                { backgroundColor: colors.muted, borderColor: colors.border, maxWidth: 64 },
                isCart && { borderWidth: 0, backgroundColor: 'transparent', paddingVertical: 0 }
              ]}
            >
              {/* numberOfLines를 2로 변경하여 공간이 좁을 때 텍스트가 자동으로 두 줄로 쪼개지게 합니다. */}
              <Text style={[styles.dropdownText, { color: colors.foreground, fontSize: 10 * fs }]} numberOfLines={2}>
                {selectedOpt || options[0]}
              </Text>
            </Pressable>
          );
        })()}         
      </View>
      <ImageViewerModal
        visible={viewerOpen}
        uri={fullImageUri}
        title={product.description}
        onClose={() => setViewerOpen(false)}
      />

      <Modal
        visible={qtyModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setQtyModalOpen(false)}
        onShow={() => setTimeout(() => qtyInputRef.current?.focus(), 50)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setQtyModalOpen(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: 15 * fs }]} numberOfLines={2}>
              {product.description}
            </Text>
            <TextInput
              ref={qtyInputRef}
              value={qtyInput}
              onChangeText={(t) => setQtyInput(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              autoFocus
              selectTextOnFocus
              maxLength={5}
              onSubmitEditing={confirmQtyInput}
              style={[styles.modalInput, { borderColor: colors.border, color: colors.foreground, fontSize: 22 * fs }]}
              testID={`qty-field-${product.upc}`}
            />
            <View style={styles.modalBtnRow}>
              <Pressable
                onPress={() => setQtyModalOpen(false)}
                style={({ pressed }) => [styles.modalBtn, { backgroundColor: colors.muted }, pressed && styles.pressed]}
              >
                <Text style={[styles.modalBtnText, { color: colors.foreground, fontSize: 14 * fs }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmQtyInput}
                style={({ pressed }) => [styles.modalBtn, { backgroundColor: colors.primary }, pressed && styles.pressed]}
                testID={`qty-ok-${product.upc}`}
              >
                <Text style={[styles.modalBtnText, { color: '#FFFFFF', fontSize: 14 * fs }]}>OK</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <View style={styles.info}>
        <View style={styles.topRow}>
          <Text
            style={[styles.desc, { color: colors.foreground, fontSize: 14 * fs }]}
            numberOfLines={2}
          >
            {product.description}
          </Text>
          {qty > 0 && (
            <Text style={[styles.inCart, { color: '#D6403A', fontSize: 12 * fs }]}>
              {qty} IN CART
            </Text>
          )}
        </View>
        <Text style={[styles.meta, { color: colors.mutedForeground, fontSize: 12 * fs, fontFamily: 'Inter_700Bold' }]}>
          #{parseItemOptions(product.itemCode).baseCode}
        </Text>
        <Text style={[styles.meta, { color: colors.mutedForeground, fontSize: 12 * fs }]}>
          {product.upc}
        </Text>
        <View style={styles.bottomRow}>
          <Text style={[styles.cost, { color: colors.accent, fontSize: 15 * fs }]}>
            ${calcPrice(Number(product.cost || 0), product.itemCode, selectedOpt).toFixed(2)}
          </Text>
          <View style={styles.actions}>
            <Pressable
              onPress={() => { haptic(); onRelated(product); }}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              testID={`related-${product.upc}`}
            >
              <MaterialCommunityIcons name="magnify-scan" size={20} color={colors.mutedForeground} />
            </Pressable>
            {onDelete && qty > 0 && (
              <Pressable
                onPress={() => { haptic(); onDelete(product.upc, selectedOpt); }}
                style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
                testID={`delete-${product.upc}`}
              >
                <Feather name="trash-2" size={18} color={colors.destructive} />
              </Pressable>
            )}
            {showQty && (
              <View style={[styles.qtyBox, { borderColor: colors.border }]}>
                <Pressable
                  onPress={() => { haptic(); onSetQty(product.upc, Math.max(0, qty - step)); }}
                  hitSlop={{ top: 14, bottom: 14, left: 14, right: 2 }}
                  style={({ pressed }) => [styles.qtyBtn, pressed && styles.pressed]}
                  testID={`minus-${product.upc}`}
                >
                  <Feather name="minus" size={16} color={colors.foreground} />
                </Pressable>
                <Pressable
                  onPress={openQtyModal}
                  hitSlop={{ top: 16, bottom: 16, left: 4, right: 4 }}
                  style={styles.qtyPress}
                  testID={`qty-input-${product.upc}`}
                >
                  <Text style={[styles.qtyText, { color: colors.foreground, fontSize: 15 * fs }]}>
                    {qty}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => { haptic(); onSetQty(product.upc, qty + step); }}
                  hitSlop={{ top: 14, bottom: 14, left: 2, right: 17 }}    //+ 버튼 터치 히트박스 설정
                  style={({ pressed }) => [styles.qtyBtn, pressed && styles.pressed]}
                  testID={`plus-${product.upc}`}
                >
                  <Feather name="plus" size={16} color={colors.foreground} />
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}, (prev, next) => {
  return prev.qty === next.qty && prev.product.upc === next.product.upc && prev.selectedOpt === next.selectedOpt;
});


// 2. 껍데기 컴포넌트: 전체 상태(Context)의 변화를 흡수하고 필요한 정보만 알맹이로 전달
export default function ItemCard(props: Props) {
  const colors = useColors();
  const fs = useFontScale();
  const { qtyOf, setQty, vendors, itemOptionOf, setItemOption } = useApp();
  
  const step = vendors.find((v) => v.id === props.product.vendorId)?.qtyStep || 1;
  
  const { options } = parseItemOptions(props.product.itemCode);
  const defaultOpt = options.length > 0 ? options[0] : undefined;
  
  const selectedOpt = props.cartOption !== undefined 
    ? props.cartOption 
    : (itemOptionOf ? (itemOptionOf(props.product.upc) || defaultOpt) : defaultOpt);
  
  const qty = qtyOf(props.product.upc, selectedOpt);

  return (
    <MemoizedCard
      {...props}
      qty={qty}
      step={step}
      colors={colors}
      fs={fs}
      onSetQty={(upc, q) => setQty(upc, q, selectedOpt)}
      selectedOpt={selectedOpt}
      onSelectOpt={setItemOption}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginHorizontal: 12,
    marginBottom: 8,
    gap: 10,
  },
  imageBox: {
    width: 64,
    height: 64,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  // 드롭다운 스타일 수정: 텍스트 중앙 정렬, 여백 조정, 폰트 웨이트 변경
  dropdownBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginTop: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownText: {
    fontFamily: 'Inter_700Bold', // Bold 처리
    textAlign: 'center',         // 중앙 정렬
  },
  info: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  desc: { flex: 1, fontFamily: 'Inter_600SemiBold' },
  inCart: { fontFamily: 'Inter_700Bold' },
  meta: { fontFamily: 'Inter_400Regular', marginTop: 1 },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  cost: { fontFamily: 'Inter_700Bold' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn: { padding: 6 },
  pressed: { opacity: 0.5 },
  qtyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
  },
  qtyBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  qtyText: { minWidth: 24, textAlign: 'center', fontFamily: 'Inter_600SemiBold' },
  qtyPress: {
    paddingHorizontal: 6,
    paddingVertical: 10,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  modalTitle: { fontFamily: 'Inter_600SemiBold' },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlign: 'center',
    fontFamily: 'Inter_700Bold',
  },
  modalBtnRow: { flexDirection: 'row', gap: 8 },
  modalBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalBtnText: { fontFamily: 'Inter_600SemiBold' },
});