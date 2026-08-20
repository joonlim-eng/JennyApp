import React from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@/components/AppIcon';
import { useColors } from '@/hooks/useColors';
import { useApp, useFontScale, Product } from '@/context/AppContext';
import ItemCard from '@/components/ItemCard';
import { useRouter } from 'expo-router';

export default function CartScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const fs = useFontScale();
  const app = useApp();
  const router = useRouter();

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const items = React.useMemo(() => {
  return app.cart
    .map((c) => app.findByUpc(c.upc))
    .filter(Boolean) as Product[];
    }, [app.cart]);

  const store = app.stores.find((s) => s.id === app.selectedStoreId);
  const vendor = app.vendors.find((v) => v.id === app.selectedVendorId);
  const c = (k: string, f: string) => app.appearance[k] || f;

  return (
    <View style={[styles.container, { backgroundColor: c('cart.bg', colors.background) }]}>
      <View style={[styles.topPanel, { paddingTop: topPad + 8, backgroundColor: c('cart.panelColor', colors.card), borderBottomColor: colors.border }]}>
        <View style={styles.totalRow}>
          
          <View style={{ flex: 1 }}>
            <View style={styles.badgesContainer}>
              <View style={[styles.contextBadge, { backgroundColor: c('cart.badgeBg', colors.border) }]}>
                <Text style={[styles.contextText, { color: colors.mutedForeground, fontSize: 11 * fs }]}>
                  {store?.name ?? 'No store'}
                </Text>
              </View>
              <View style={[styles.contextBadge, { backgroundColor: c('cart.badgeBg', colors.border) }]}>
                <Text style={[styles.contextText, { color: colors.mutedForeground, fontSize: 11 * fs }]}>
                  {vendor?.name ?? 'No vendor'}
                </Text>
              </View>
              {app.shipToJBS && (
                <View style={[styles.contextBadge, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.contextText, { color: colors.primaryForeground, fontSize: 11 * fs, fontFamily: 'Inter_600SemiBold' }]}>
                    SHIP TO JBS
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.totalValue, { color: c('cart.totalColor', colors.primary), fontSize: 26 * fs }]}>
              ${app.cartTotal.toFixed(2)}
            </Text>
          </View>



          <View style={[styles.countBadge, { backgroundColor: c('cart.badgeColor', colors.secondary) }]}>
            <Text style={[styles.countText, { color: colors.secondaryForeground, fontSize: 13 * fs }]}>
              {app.cart.reduce((s, c) => s + c.qty, 0)} pc
            </Text>
          </View>
          {items.length > 0 && (
            <Pressable
              onPress={() => {
                const doClear = () => app.clearCart();
                if (Platform.OS === 'web') {
                  // eslint-disable-next-line no-alert
                  if (window.confirm('Empty the cart?')) doClear();
                } else {
                  Alert.alert('Empty Cart', 'Remove all items from the cart?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Empty', style: 'destructive', onPress: doClear },
                  ]);
                }
              }}
              style={({ pressed }) => [
                styles.emptyBtn,
                { borderColor: colors.destructive },
                pressed && { opacity: 0.6 },
              ]}
              testID="empty-cart"
            >
              <MaterialCommunityIcons name="cart-remove" size={16} color={colors.destructive} />
              <Text style={[styles.emptyBtnText, { color: colors.destructive, fontSize: 12 * fs }]}>
                {c('cart.emptyBtnLabel', 'EMPTY')}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(p) => p.upc}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ItemCard
            product={item}
            // 넘어갈 때 relatedUpc 라는 이름으로 바코드 번호를 함께 전송
            onRelated={() => router.push({ pathname: '/(tabs)/scan', params: { relatedUpc: item.upc } })}
            onDelete={(upc) => app.setQty(upc, 0)}
          />
        )}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name="cart-outline" size={44} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground, fontSize: 14 * fs }]}>
              {c('cart.emptyText', 'Cart is empty\nAdd items from the SCAN tab')}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topPanel: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  /* 추가된 뱃지 나열용 컨테이너 스타일 */
  badgesContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    flexWrap: 'wrap', // 화면이 좁을 경우 줄바꿈 처리
    gap: 6, // 뱃지 사이의 간격
    marginBottom: 4, 
  },
  /* 개별 뱃지 스타일 */
  contextBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },

  contextText: { fontFamily: 'Inter_500Medium' },
  totalValue: { fontFamily: 'Inter_700Bold', marginTop: 2 },
  countBadge: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  countText: { fontFamily: 'Inter_600SemiBold' },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  emptyBtnText: { fontFamily: 'Inter_600SemiBold' },
  list: { paddingTop: 12, paddingBottom: 120 },
  emptyBox: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
});
