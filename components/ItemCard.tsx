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

interface Props {
  product: Product;
  onRelated: (p: Product) => void;
  onDelete?: (upc: string) => void;
  showQty?: boolean;
}

function haptic() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

// 1. 방어막이 쳐진 알맹이 UI (내 수량(qty)이 바뀌지 않으면 절대 다시 그리지 않음)
const MemoizedCard = memo(({
  product, onRelated, onDelete, showQty = true, qty, step, colors, fs, onSetQty
}: Props & { qty: number; step: number; colors: any; fs: number; onSetQty: (upc: string, q: number) => void }) => {
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
          #{product.itemCode}
        </Text>
        <Text style={[styles.meta, { color: colors.mutedForeground, fontSize: 12 * fs }]}>
          {product.upc}
        </Text>
        <View style={styles.bottomRow}>
          <Text style={[styles.cost, { color: colors.accent, fontSize: 15 * fs }]}>
            ${Number(product.cost || 0).toFixed(2)}
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
                onPress={() => { haptic(); onDelete(product.upc); }}
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
  // 핵심 방어막: 카트에 담긴 개수(qty)가 이전과 똑같으면 화면을 절대 다시 그리지 않음!
  return prev.qty === next.qty && prev.product.upc === next.product.upc;
});


// 2. 껍데기 컴포넌트: 전체 상태(Context)의 변화를 흡수하고 필요한 정보만 알맹이로 전달
export default function ItemCard(props: Props) {
  const colors = useColors();
  const fs = useFontScale();
  const { qtyOf, setQty, vendors } = useApp();
  
  const qty = qtyOf(props.product.upc);
  const step = vendors.find((v) => v.id === props.product.vendorId)?.qtyStep || 1;

  return (
    <MemoizedCard
      {...props}
      qty={qty}
      step={step}
      colors={colors}
      fs={fs}
      onSetQty={setQty}
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