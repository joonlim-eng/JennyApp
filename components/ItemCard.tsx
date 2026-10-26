
import React, { useState, memo } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useApp, useFontScale, parseItemOptions, calcPrice, Product } from '@/context/AppContext';
import { Feather, MaterialCommunityIcons } from '@/components/AppIcon';
import * as Haptics from 'expo-haptics';
import { resolveImageUrl } from '@/lib/driveImage';
import ImageViewerModal from '@/components/ImageViewerModal';

interface Props {
  product: Product;
  onRelated: (p: Product) => void;
  onDelete?: (upc: string, opt?: string) => void;
  showQty?: boolean;
  cartOption?: string; // 카트 화면용 고정 옵션
}

function haptic(isHapticDisabled?: boolean) {
  if (isHapticDisabled) return;
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

type CardProps = Props & {
  qty: number;
  step: number;
  colors: ReturnType<typeof useColors>;
  fs: number;
  onSetQty: (upc: string, qty: number, opt?: string) => void;
  selectedOpt?: string;
  onSelectOpt: (upc: string, opt: string) => void;
  isHapticDisabled: boolean;
  isOutOfStock: boolean;
};

const MemoizedCard = memo(({
  product, onRelated, onDelete, showQty = true, cartOption,
  qty, step, colors, fs, onSetQty, selectedOpt, onSelectOpt,
  isHapticDisabled, isOutOfStock,
}: CardProps) => {
  const [failedImageUri, setFailedImageUri] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [qtyModalOpen, setQtyModalOpen] = useState(false);
  const [qtyInput, setQtyInput] = useState('');
  const qtyInputRef = React.useRef<TextInput>(null);

  const openQtyModal = () => {
    if (isOutOfStock) return;
    haptic(isHapticDisabled);
    setQtyInput(qty > 0 ? String(qty) : '');
    setQtyModalOpen(true);
  };

  const confirmQtyInput = () => {
    if (isOutOfStock) return;
    const n = parseInt(qtyInput.replace(/[^0-9]/g, ''), 10);
    if (!n || n <= 0) return;
    onSetQty(product.upc, n, selectedOpt);
    setQtyModalOpen(false);
  };

  const imageUri = resolveImageUrl(product.imageUrl);
  const fullImageUri = resolveImageUrl(product.imageUrl, 'w1000');
  const imageFailed = !!imageUri && failedImageUri === imageUri;
  const { baseCode, options } = parseItemOptions(product.itemCode);
  const isCart = cartOption !== undefined;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.imageColumn}>
        <Pressable
          onPress={() => {
            if (imageUri && !imageFailed) {
              haptic(isHapticDisabled);
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
              onError={() => setFailedImageUri(imageUri || null)}
            />
          ) : (
            <MaterialCommunityIcons name="package-variant-closed" size={28} color={colors.mutedForeground} />
          )}
        </Pressable>

        {options.length > 0 && (
          <Pressable
            onPress={() => {
              if (isCart) return;
              haptic(isHapticDisabled);
              const currentIndex = options.indexOf(selectedOpt || options[0]);
              const nextIndex = (currentIndex + 1) % options.length;
              onSelectOpt(product.upc, options[nextIndex]);
            }}
            disabled={isCart}
            style={[
              styles.dropdownBtn,
              { backgroundColor: colors.muted, borderColor: colors.border },
              isCart && { borderWidth: 0, backgroundColor: 'transparent', paddingVertical: 0 },
            ]}
          >
            <Text
              style={[styles.dropdownText, { color: colors.foreground, fontSize: 10 * fs }]}
              numberOfLines={2}
            >
              {selectedOpt || options[0]}
            </Text>
          </Pressable>
        )}
      </View>
      <ImageViewerModal
        visible={viewerOpen}
        uri={fullImageUri}
        title={product.description}
        onClose={() => setViewerOpen(false)}
      />

      <Modal
        visible={qtyModalOpen && !isOutOfStock}
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
            style={[styles.desc, { color: colors.foreground, fontSize: 14 * fs }, isOutOfStock && { opacity: 0.4 }]}
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
          #{baseCode}
        </Text>
        <Text style={[styles.meta, { color: colors.mutedForeground, fontSize: 12 * fs }]}>
          {product.upc}
        </Text>
        <View style={styles.bottomRow}>
          <Text style={[styles.cost, { color: colors.accent, fontSize: 15 * fs }]}>
            ${calcPrice(product.cost, product.itemCode, selectedOpt).toFixed(2)}
          </Text>
          <View style={styles.actions}>
            <Pressable
              onPress={() => { haptic(isHapticDisabled); onRelated(product); }}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              testID={`related-${product.upc}`}
            >
              <MaterialCommunityIcons name="magnify-scan" size={20} color={colors.mutedForeground} />
            </Pressable>
            {onDelete && qty > 0 && (
              <Pressable
                onPress={() => { haptic(isHapticDisabled); onDelete(product.upc, selectedOpt); }}
                style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
                testID={`delete-${product.upc}`}
              >
                <Feather name="trash-2" size={18} color={colors.destructive} />
              </Pressable>
            )}
            {showQty && (
              <View style={[styles.qtyBox, { borderColor: colors.border }, isOutOfStock && { opacity: 0.4 }]}>
                <Pressable
                  disabled={isOutOfStock}
                  onPress={() => { haptic(isHapticDisabled); onSetQty(product.upc, Math.max(0, qty - step), selectedOpt); }}
                  hitSlop={{ top: 14, bottom: 14, left: 14, right: 2 }}
                  style={({ pressed }) => [styles.qtyBtn, pressed && styles.pressed]}
                  testID={`minus-${product.upc}`}
                >
                  <Feather name="minus" size={16} color={colors.foreground} />
                </Pressable>
                <Pressable
                  disabled={isOutOfStock}
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
                  disabled={isOutOfStock}
                  onPress={() => { haptic(isHapticDisabled); onSetQty(product.upc, qty + step, selectedOpt); }}
                  hitSlop={{ top: 14, bottom: 14, left: 2, right: 17 }}
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
  const a = prev.product;
  const b = next.product;
  const c = prev.colors;
  const d = next.colors;

  return (
    a.upc === b.upc &&
    a.vendorId === b.vendorId &&
    a.itemCode === b.itemCode &&
    a.description === b.description &&
    a.cost === b.cost &&
    a.imageUrl === b.imageUrl &&
    prev.qty === next.qty &&
    prev.step === next.step &&
    prev.fs === next.fs &&
    prev.showQty === next.showQty &&
    prev.cartOption === next.cartOption &&
    prev.selectedOpt === next.selectedOpt &&
    prev.isHapticDisabled === next.isHapticDisabled &&
    prev.isOutOfStock === next.isOutOfStock &&
    prev.onRelated === next.onRelated &&
    prev.onDelete === next.onDelete &&
    prev.onSetQty === next.onSetQty &&
    prev.onSelectOpt === next.onSelectOpt &&
    c.card === d.card &&
    c.border === d.border &&
    c.muted === d.muted &&
    c.mutedForeground === d.mutedForeground &&
    c.foreground === d.foreground &&
    c.accent === d.accent &&
    c.primary === d.primary &&
    c.destructive === d.destructive
  );
});

export default function ItemCard(props: Props) {
  const colors = useColors();
  const fs = useFontScale();
  const {
    qtyOf, setQty, vendors, itemOptionOf, setItemOption,
    isHapticDisabled, isProductOutOfStock,
  } = useApp();

  // 최신 화면 콜백을 참조하면서 카드에는 안정적인 함수 참조를 전달한다.
  const actionsRef = React.useRef({ onRelated: props.onRelated, onDelete: props.onDelete });
  actionsRef.current.onRelated = props.onRelated;
  actionsRef.current.onDelete = props.onDelete;

  const handleRelated = React.useCallback((product: Product) => {
    actionsRef.current.onRelated(product);
  }, []);
  const handleDelete = React.useCallback((upc: string, opt?: string) => {
    actionsRef.current.onDelete?.(upc, opt);
  }, []);

  const step = vendors.find((v) => v.id === props.product.vendorId)?.qtyStep || 1;
  const { options } = parseItemOptions(props.product.itemCode);
  const defaultOpt = options.length > 0 ? options[0] : undefined;
  const selectedOpt = props.cartOption !== undefined
    ? props.cartOption
    : (itemOptionOf ? (itemOptionOf(props.product.upc) || defaultOpt) : defaultOpt);

  // AppContext의 실제 qtyOf 구현은 옵션 인수를 지원한다.
  const getQty = qtyOf as (upc: string, opt?: string) => number;
  const qty = getQty(props.product.upc, selectedOpt);

  return (
    <MemoizedCard
      {...props}
      qty={qty}
      step={step}
      colors={colors}
      fs={fs}
      onSetQty={setQty}
      selectedOpt={selectedOpt}
      onSelectOpt={setItemOption}
      onRelated={handleRelated}
      onDelete={props.onDelete ? handleDelete : undefined}
      isHapticDisabled={isHapticDisabled}
      isOutOfStock={isProductOutOfStock(props.product)}
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
  imageColumn: { width: 64, alignItems: 'center' },
  imageBox: {
    width: 64,
    height: 64,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  dropdownBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginTop: 6,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 64,
  },
  dropdownText: {
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
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