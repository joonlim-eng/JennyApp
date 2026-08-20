import React, { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Feather, MaterialCommunityIcons } from '@/components/AppIcon';
import { useColors } from '@/hooks/useColors';
import { themes } from '@/constants/colors';
import { useApp } from '@/context/AppContext';

function notify(title: string, msg: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${msg}`);
  else Alert.alert(title, msg);
}

function confirmAction(title: string, msg: string, onOk: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${msg}`)) onOk();
  } else {
    Alert.alert(title, msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'OK', style: 'destructive', onPress: onOk },
    ]);
  }
}

type Section = 'users' | 'connection' | 'ui';

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const app = useApp();
  const [open, setOpen] = useState<Section | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  if (app.session?.role !== 'master') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <Feather name="lock" size={40} color={colors.mutedForeground} />
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', marginTop: 12 }}>
          Admin only
        </Text>
      </View>
    );
  }

  const toggle = (s: Section) => setOpen(open === s ? null : s);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: topPad + 16 }]}>
        <Text style={[styles.title, { color: colors.primary }]}>SETTING</Text>

        <SectionHeader label="Users" icon="users" open={open === 'users'} onPress={() => toggle('users')} />
        {open === 'users' && <UsersSection />}

        <SectionHeader label="Google Connection (Apps Script)" icon="link" open={open === 'connection'} onPress={() => toggle('connection')} />
        {open === 'connection' && <ConnectionSection />}

        <SectionHeader label="Appearance" icon="sliders" open={open === 'ui'} onPress={() => toggle('ui')} />
        {open === 'ui' && <UiSection />}
      </ScrollView>
    </View>
  );
}

function SectionHeader({ label, icon, open, onPress }: { label: string; icon: any; open: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.sectionHeader,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Feather name={icon} size={18} color={colors.accent} />
      <Text style={[styles.sectionHeaderText, { color: colors.foreground }]}>{label}</Text>
      <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

/* ---------- Users ---------- */
function UsersSection() {
  const colors = useColors();
  const app = useApp();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    const result = await app.refreshRemoteUsers();
    setRefreshing(false);
    if (!result.ok) notify('Refresh Failed', result.message);
  };

  // pull approval requests from the Google Sheet when the section opens
  useEffect(() => {
    if (app.settings.appsScriptUrl.trim()) handleRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.sectionBody}>
      <Pressable
        onPress={handleRefresh}
        disabled={refreshing}
        style={({ pressed }) => [
          styles.refreshBtn,
          { borderColor: colors.accent },
          (pressed || refreshing) && { opacity: 0.6 },
        ]}
        testID="users-refresh"
      >
        <Feather name="refresh-cw" size={14} color={colors.accent} />
        <Text style={[styles.refreshBtnText, { color: colors.accent }]}>
          {refreshing ? 'Checking sheet…' : 'CHECK APPROVAL REQUESTS'}
        </Text>
      </Pressable>
      {app.users.map((u) => (
        <View key={u.email} style={[styles.row, { borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: colors.foreground }]}>{u.email}</Text>
            <Text style={[styles.rowSub, { color: u.status === 'active' ? colors.success : colors.warning }]}>
              {u.role === 'master' ? 'Master' : u.role === 'admin' ? 'Admin' : 'Staff'} · {u.status === 'active' ? 'Active (device registered)' : u.pin ? `Approved · PIN: ${u.pin}` : 'Pending approval'}
            </Text>
          </View>
          {u.status === 'pending' && !u.pin && (
            <Pressable
              onPress={() => {
                const pin = app.approveUser(u.email);
                notify('Approved', `${u.email}\nPIN: ${pin}\n\nShare this PIN with the staff member.`);
              }}
              style={[styles.smallAction, { backgroundColor: colors.accent }]}
            >
              <Text style={styles.smallActionText}>Approve</Text>
            </Pressable>
          )}
          {u.status === 'active' && u.email !== app.session?.email && (
            <Pressable
              onPress={() =>
                confirmAction('Reset Device', `Unregister this device for ${u.email}?\nA new PIN will be required to re-register.`, () => {
                  const pin = app.resetDevice(u.email);
                  notify('Device Reset', `New PIN: ${pin}`);
                })
              }
              style={[styles.smallAction, { backgroundColor: colors.warning }]}
            >
              <Text style={styles.smallActionText}>Reset</Text>
            </Pressable>
          )}
          {u.email !== app.session?.email && (
            <Pressable
              onPress={() => confirmAction('Delete User', `Delete ${u.email}?`, () => app.removeUser(u.email))}
              style={styles.iconBtn}
            >
              <Feather name="trash-2" size={16} color={colors.destructive} />
            </Pressable>
          )}
        </View>
      ))}
      {app.users.length === 0 && (
        <Text style={[styles.rowSub, { color: colors.mutedForeground, padding: 12 }]}>No registered users</Text>
      )}
      <Pressable
        onPress={() =>
          confirmAction(
            'Force Logout All',
            'Sign out every device (except this one)?\nEach device will be logged out on its next sync.',
            async () => {
              const result = await app.forceLogoutAll();
              notify(result.ok ? 'Done' : 'Failed', result.message);
            },
          )
        }
        style={({ pressed }) => [
          styles.refreshBtn,
          { borderColor: colors.destructive, marginTop: 12 },
          pressed && { opacity: 0.6 },
        ]}
        testID="force-logout-all"
      >
        <Feather name="log-out" size={14} color={colors.destructive} />
        <Text style={[styles.refreshBtnText, { color: colors.destructive }]}>
          FORCE LOGOUT ALL DEVICES
        </Text>
      </Pressable>
    </View>
  );
}

/* ---------- Connection ---------- */
function ConnectionSection() {
  const colors = useColors();
  const app = useApp();
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    const result = await app.syncFromSheets();
    setSyncing(false);
    notify(result.ok ? 'Sync Complete' : 'Sync Failed', result.message);
  };

  return (
    <View style={styles.sectionBody}>
      <Field
        label="Apps Script Web App URL"
        value={app.settings.appsScriptUrl}
        onChange={(v) => app.updateSettings({ appsScriptUrl: v })}
        placeholder="https://script.google.com/macros/s/.../exec"
      />
      <Pressable
        onPress={handleSync}
        disabled={syncing}
        style={({ pressed }) => [
          styles.syncBtn,
          { backgroundColor: colors.accent },
          (pressed || syncing) && { opacity: 0.6 },
        ]}
        testID="sync-btn"
      >
        <Feather name="refresh-cw" size={16} color="#fff" />
        <Text style={styles.smallActionText}>{syncing ? 'Syncing…' : 'SYNC FROM GOOGLE SHEETS'}</Text>
      </Pressable>
      {app.lastSyncAt && (
        <Text style={[styles.rowSub, { color: colors.mutedForeground, marginBottom: 6 }]}>
          Last sync: {new Date(app.lastSyncAt).toLocaleString()}
        </Text>
      )}
      {/* 동기화 방식: 전체 vs 벤더 선택 시 그 벤더만 */}
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.foreground, marginTop: 10 }}>Sync Mode</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        {(
          [
            { v: 'all', label: 'FULL SYNC' },
            { v: 'vendor', label: 'VENDOR ONLY' },
          ] as const
        ).map((o) => {
          const active = app.settings.syncMode === o.v;
          return (
            <Pressable
              key={o.v}
              onPress={() => app.updateSettings({ syncMode: o.v })}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 8,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: active ? colors.accent : colors.border,
                backgroundColor: active ? colors.accent : 'transparent',
              }}
              testID={`sync-mode-${o.v}`}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: active ? '#fff' : colors.mutedForeground,
                }}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.rowSub, { color: colors.mutedForeground, marginTop: 4, marginBottom: 6 }]}>
        FULL SYNC: loads every vendor's products at once.{'\n'}
        VENDOR ONLY: loads products only when a vendor is selected on HOME.
      </Text>
      <Text style={[styles.rowSub, { color: colors.mutedForeground, lineHeight: 18 }]}>
        Deploy your Google Apps Script as a Web App and paste the URL here.{'\n'}
        Pressing SEND posts the order data (JSON) to this URL.{'\n'}
        Spreadsheet logging and email sending are handled by the Apps Script.
      </Text>
    </View>
  );
}

/* ---------- UI ---------- */
function UiSection() {
  const colors = useColors();
  const app = useApp();
  const options: { v: 'small' | 'medium' | 'large'; label: string }[] = [
    { v: 'small', label: 'Small' },
    { v: 'medium', label: 'Medium' },
    { v: 'large', label: 'Large' },
  ];
  const [sub, setSub] = useState<string | null>(null);
  const toggleSub = (s: string) => setSub(sub === s ? null : s);
  return (
    <View style={styles.sectionBody}>
      <SubHeader label="General" open={sub === 'general'} onPress={() => toggleSub('general')} />
      {sub === 'general' && (
      <View>
      <Field
        label="App Title"
        value={app.settings.appTitle}
        onChange={(v) => app.updateSettings({ appTitle: v })}
        placeholder="JENNY"
      />
      <Text style={[styles.mapLabel, { color: colors.mutedForeground }]}>Theme</Text>
      <View style={[styles.fontRow, { marginBottom: 12, flexWrap: 'wrap' }]}>
        {Object.entries(themes).map(([name, t]) => (
          <Pressable
            key={name}
            onPress={() => app.updateSettings({ theme: name })}
            style={[
              styles.themeOption,
              {
                borderColor: app.settings.theme === name ? t.accent : colors.border,
                borderWidth: app.settings.theme === name ? 2 : 1,
                backgroundColor: colors.card,
              },
            ]}
          >
            <View style={styles.swatchRow}>
              <View style={[styles.swatch, { backgroundColor: t.primary }]} />
              <View style={[styles.swatch, { backgroundColor: t.accent }]} />
            </View>
            <Text
              style={{
                color: colors.foreground,
                fontFamily: app.settings.theme === name ? 'Inter_600SemiBold' : 'Inter_400Regular',
                fontSize: 12,
                textTransform: 'capitalize',
              }}
            >
              {name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={[styles.mapLabel, { color: colors.mutedForeground }]}>Font Size</Text>
      <View style={[styles.fontRow, { marginBottom: 12 }]}>
        {options.map((o) => (
          <Pressable
            key={o.v}
            onPress={() => app.updateSettings({ fontScale: o.v })}
            style={[
              styles.fontOption,
              {
                backgroundColor: app.settings.fontScale === o.v ? colors.accent : colors.muted,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={{
                color: app.settings.fontScale === o.v ? '#fff' : colors.foreground,
                fontFamily: 'Inter_600SemiBold',
                fontSize: 13,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        ))}
      </View>
      </View>
      )}

      <SubHeader label="Login Screen" open={sub === 'login'} onPress={() => toggleSub('login')} />
      {sub === 'login' && (
      <View>
      <Text style={[styles.rowSub, { color: colors.mutedForeground, marginBottom: 10, lineHeight: 17 }]}>
        These settings upload to the Google Sheet and apply to every device after SYNC (or app restart).
      </Text>
      <ColorField
        label="Background Color (e.g. #12294B)"
        value={app.settings.loginBgColor}
        onChange={(v) => app.updateSettings({ loginBgColor: v })}
      />
      <ColorField
        label="Title Color (e.g. #FFFFFF)"
        value={app.settings.loginTitleColor}
        onChange={(v) => app.updateSettings({ loginTitleColor: v })}
      />
      <Field
        label="Subtitle Text"
        value={app.settings.loginSubtitle}
        onChange={(v) => app.updateSettings({ loginSubtitle: v })}
        placeholder="Inventory & Order System"
      />
      <ColorField
        label="Subtitle Color (e.g. #99AACC)"
        value={app.settings.loginSubtitleColor}
        onChange={(v) => app.updateSettings({ loginSubtitleColor: v })}
      />
      <ColorField
        label="Card Box Color"
        value={app.settings.loginCardColor}
        onChange={(v) => app.updateSettings({ loginCardColor: v })}
      />
      <Field
        label="Card Title Text"
        value={app.settings.loginLabelText}
        onChange={(v) => app.updateSettings({ loginLabelText: v })}
        placeholder="Sign in with Google"
      />
      <ColorField
        label="Card Title Color"
        value={app.settings.loginLabelColor}
        onChange={(v) => app.updateSettings({ loginLabelColor: v })}
      />
      <Field
        label="Hint Text"
        value={app.settings.loginHintText}
        onChange={(v) => app.updateSettings({ loginHintText: v })}
        multiline
      />
      <ColorField
        label="Hint Color"
        value={app.settings.loginHintColor}
        onChange={(v) => app.updateSettings({ loginHintColor: v })}
      />
      <Field
        label="Button Text"
        value={app.settings.loginButtonText}
        onChange={(v) => app.updateSettings({ loginButtonText: v })}
        placeholder="SIGN IN WITH GOOGLE"
      />
      <ColorField
        label="Button Color"
        value={app.settings.loginButtonColor}
        onChange={(v) => app.updateSettings({ loginButtonColor: v })}
      />
      <ColorField
        label="Button Text Color"
        value={app.settings.loginButtonTextColor}
        onChange={(v) => app.updateSettings({ loginButtonTextColor: v })}
      />
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Login Icon</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <Image
          source={
            app.settings.loginIconUri
              ? { uri: app.settings.loginIconUri }
              : require('@/assets/images/icon.png')
          }
          style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: colors.muted }}
        />
        <Pressable
          onPress={async () => {
            const r = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
              base64: true,
            });
            if (r.canceled || !r.assets?.[0]) return;
            const a = r.assets[0];
            // base64 data URI: 갤러리 원본이 지워져도 아이콘 유지
            const uri = a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
            app.updateSettings({ loginIconUri: uri });
          }}
          style={[styles.fontOption, { backgroundColor: colors.accent, borderColor: colors.border }]}
        >
          <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Choose Image</Text>
        </Pressable>
        {!!app.settings.loginIconUri && (
          <Pressable
            onPress={() => app.updateSettings({ loginIconUri: '' })}
            style={[styles.fontOption, { backgroundColor: colors.muted, borderColor: colors.border }]}
          >
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Reset</Text>
          </Pressable>
        )}
      </View>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Live Preview</Text>
      <LoginPreview />
      </View>
      )}

      <SubHeader label="HOME" open={sub === 'home'} onPress={() => toggleSub('home')} />
      {sub === 'home' && <AppearanceFields defs={HOME_FIELDS} />}

      <SubHeader label="SCAN" open={sub === 'scan'} onPress={() => toggleSub('scan')} />
      {sub === 'scan' && <AppearanceFields defs={SCAN_FIELDS} />}

      <SubHeader label="CART" open={sub === 'cart'} onPress={() => toggleSub('cart')} />
      {sub === 'cart' && <AppearanceFields defs={CART_FIELDS} />}
    </View>
  );
}

// smaller collapsible header used inside Appearance
function SubHeader({ label, open, onPress }: { label: string; open: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.muted,
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        marginBottom: 8,
        marginTop: 2,
      }}
    >
      <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{label}</Text>
      <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

type AppearanceDef = { key: string; label: string; type: 'color' | 'text'; ph?: string; multiline?: boolean };

const HOME_FIELDS: AppearanceDef[] = [
  { key: 'home.bg', label: 'Background Color', type: 'color' },
  { key: 'home.brandColor', label: 'Title (JENNY) Color', type: 'color' },
  { key: 'home.totalCardColor', label: 'TOTAL Card Color', type: 'color' },
  { key: 'home.totalLabel', label: 'TOTAL Label Text', type: 'text', ph: 'TOTAL' },
  { key: 'home.storeLabel', label: 'Store Section Text', type: 'text', ph: 'SELECT STORE' },
  { key: 'home.shipLabel', label: 'Ship Toggle Text', type: 'text', ph: 'SHIP TO JBS' },
  { key: 'home.vendorLabel', label: 'Vendor Section Text', type: 'text', ph: 'SELECT VENDOR' },
  { key: 'home.savedLabel', label: 'Saved Section Text', type: 'text', ph: 'SAVED LIST' },
  { key: 'home.sendLabel', label: 'SEND Button Text', type: 'text', ph: 'SEND' },
  { key: 'home.sendColor', label: 'SEND Button Color', type: 'color' },
  { key: 'home.saveLabel', label: 'SAVE Button Text', type: 'text', ph: 'SAVE' },
  { key: 'home.saveColor', label: 'SAVE Button Color', type: 'color' },
  { key: 'home.loadLabel', label: 'ORDER LOAD Button Text', type: 'text', ph: 'ORDER LOAD' },
  { key: 'home.loadColor', label: 'ORDER LOAD Button Color', type: 'color' },
  { key: 'home.exportLabel', label: 'EXPORT Button Text', type: 'text', ph: 'EXPORT TO EXCEL' },
  { key: 'home.exportColor', label: 'EXPORT Button Color', type: 'color' },
];

const SCAN_FIELDS: AppearanceDef[] = [
  { key: 'scan.bg', label: 'Background Color', type: 'color' },
  { key: 'scan.placeholder', label: 'Search Placeholder Text', type: 'text', ph: 'Search name, #code, or UPC' },
  { key: 'scan.emptyText', label: 'Empty List Text', type: 'text', ph: 'Scan a barcode or search…', multiline: true },
];

const CART_FIELDS: AppearanceDef[] = [
  { key: 'cart.bg', label: 'Background Color', type: 'color' },
  { key: 'cart.panelColor', label: 'Top Panel Color', type: 'color' },
  { key: 'cart.totalColor', label: 'Total Amount Color', type: 'color' },
  { key: 'cart.badgeColor', label: 'Count Badge Color', type: 'color' },
  { key: 'cart.emptyText', label: 'Empty Cart Text', type: 'text', ph: 'Cart is empty…', multiline: true },
];

// generic renderer: values live in app.appearance and sync to the sheet
function AppearanceFields({ defs }: { defs: AppearanceDef[] }) {
  const app = useApp();
  return (
    <View>
      {defs.map((d) =>
        d.type === 'color' ? (
          <ColorField
            key={d.key}
            label={d.label}
            value={app.appearance[d.key] ?? ''}
            onChange={(v) => app.updateAppearance(d.key, v)}
          />
        ) : (
          <Field
            key={d.key}
            label={`${d.label} (blank = default)`}
            value={app.appearance[d.key] ?? ''}
            onChange={(v) => app.updateAppearance(d.key, v)}
            placeholder={d.ph}
            multiline={d.multiline}
          />
        ),
      )}
    </View>
  );
}

// live miniature of the login screen, driven by current settings
function LoginPreview() {
  const colors = useColors();
  const app = useApp();
  const s = app.settings;
  const bg = s.loginBgColor || colors.primary;
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 12,
        paddingVertical: 20,
        paddingHorizontal: 16,
        alignItems: 'center',
        marginBottom: 14,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Image
        source={s.loginIconUri ? { uri: s.loginIconUri } : require('@/assets/images/icon.png')}
        style={{ width: 44, height: 44, borderRadius: 10, marginBottom: 8 }}
      />
      <Text style={{ color: s.loginTitleColor || '#fff', fontSize: 18, fontFamily: 'Inter_700Bold', letterSpacing: 2 }}>
        {s.appTitle}
      </Text>
      <Text style={{ color: s.loginSubtitleColor || 'rgba(255,255,255,0.6)', fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 2, marginBottom: 12 }}>
        {s.loginSubtitle}
      </Text>
      <View style={{ backgroundColor: s.loginCardColor || colors.card, borderRadius: 10, padding: 12, alignSelf: 'stretch' }}>
        <Text style={{ color: s.loginLabelColor || colors.foreground, fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 4 }}>
          {s.loginLabelText}
        </Text>
        <Text style={{ color: s.loginHintColor || colors.mutedForeground, fontSize: 9, fontFamily: 'Inter_400Regular', marginBottom: 8 }}>
          {s.loginHintText}
        </Text>
        <View
          style={{
            backgroundColor: s.loginButtonColor || colors.accent,
            borderRadius: 7,
            paddingVertical: 8,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: s.loginButtonTextColor || '#fff', fontSize: 10, fontFamily: 'Inter_600SemiBold' }}>
            {s.loginButtonText}
          </Text>
        </View>
      </View>
    </View>
  );
}

/* ---------- shared small components ---------- */
// hex color input with live preview swatch; '' = theme default
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const colors = useColors();
  const [text, setText] = useState(value);
  const valid = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(text.trim());
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            const t = v.trim();
            if (/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(t)) onChange(t);
            else if (t === '') onChange('');
          }}
          placeholder="#RRGGBB (blank = default)"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          style={[
            styles.fieldInput,
            { flex: 1, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card },
          ]}
        />
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: valid ? text.trim() : colors.muted,
          }}
        />
      </View>
    </View>
  );
}

function Field({
  label, value, onChange, multiline, placeholder, keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  keyboardType?: any;
}) {
  const colors = useColors();
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize="none"
        keyboardType={keyboardType}
        style={[
          styles.fieldInput,
          { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card },
          multiline && { height: 80, textAlignVertical: 'top' },
        ]}
      />
    </View>
  );
}

function SmallBtn({ label, onPress, variant }: { label: string; onPress: () => void; variant?: 'ghost' }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.smallBtn,
        variant === 'ghost'
          ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }
          : { backgroundColor: colors.accent },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text
        style={{
          color: variant === 'ghost' ? colors.foreground : '#fff',
          fontFamily: 'Inter_600SemiBold',
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 120 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, marginBottom: 16 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
  },
  sectionHeaderText: { flex: 1, fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  sectionBody: { marginBottom: 12, paddingHorizontal: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingVertical: 10,
    gap: 6,
  },
  rowTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  rowSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  iconBtn: { padding: 8 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 10,
  },
  addBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  editBox: { borderRadius: 12, padding: 12, marginTop: 10 },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginBottom: 4, letterSpacing: 0.5 },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  mapLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, marginBottom: 6, marginTop: 4 },
  mapGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  mapField: { width: '30%' },
  mapInput: { textAlign: 'center' },
  smallBtn: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 9 },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 8,
  },
  smallAction: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 9,
    marginBottom: 8,
  },
  refreshBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
  smallActionText: { color: '#fff', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  fontRow: { flexDirection: 'row', gap: 8 },
  themeOption: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 4,
  },
  swatchRow: { flexDirection: 'row', gap: 4 },
  swatch: { width: 16, height: 16, borderRadius: 8 },
  fontOption: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 18, paddingVertical: 9 },
});