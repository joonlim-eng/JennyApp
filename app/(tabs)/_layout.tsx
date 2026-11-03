import React from 'react';
import { useColors } from '@/hooks/useColors';
import { Feather, MaterialCommunityIcons } from '@/components/AppIcon';
import { Tabs } from 'expo-router';
import { useApp } from '@/context/AppContext';

// Android native layout is the master layout.
// Web and iOS use the same tab structure, dimensions and icons.
function ClassicTabLayout({
  isAdmin,
  canPurchase,
}: {
  isAdmin: boolean;
  canPurchase: boolean;
}) {
  const colors = useColors();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,

        // Keep Android native tab geometry on every platform.
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: colors.background,
          borderTopWidth: 0,
          elevation: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'HOME',
          tabBarIcon: ({ color }) => (
            <Feather name="home" size={22} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="scan"
        options={{
          title: 'SCAN',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name="barcode-scan"
              size={22}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="cart"
        options={{
          title: 'CART',
          tabBarIcon: ({ color }) => (
            <Feather name="shopping-cart" size={22} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="purchase"
        options={{
          href: canPurchase ? undefined : null,
          title: 'PURCHASE',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name="receipt-text-outline"
              size={22}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          href: isAdmin ? undefined : null,
          title: 'SETTINGS',
          tabBarIcon: ({ color }) => (
            <Feather name="settings" size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const { session, purchaseAccess } = useApp();
  const isMaster = session?.role === 'master';
  const isAdmin = isMaster; // SETTINGS 탭은 MASTER 전용

  // PURCHASE tab requires a verified USERS G/H permission from the server.
  // STAFF is always denied, even if G/H contains values.
  const canPurchase = isMaster || Boolean(
  session?.role === 'admin' &&
  purchaseAccess &&
  purchaseAccess.email === session?.email?.trim().toLowerCase() &&
  purchaseAccess.departments.length > 0 &&
  purchaseAccess.stores.length > 0
);

  // Android native layout is the reference layout for Android, Web and iOS.
  return (
    <ClassicTabLayout
      isAdmin={isAdmin}
      canPurchase={canPurchase}
    />
  );
}
