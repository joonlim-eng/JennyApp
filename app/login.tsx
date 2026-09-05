import React, { useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { Feather } from '@/components/AppIcon';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

// closes the auth popup on web after Google redirects back
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { loginWithGoogle, settings } = useApp();
  const bg = settings.loginBgColor || colors.primary;
  const titleColor = settings.loginTitleColor || '#fff';
  const subColor = settings.loginSubtitleColor || 'rgba(255,255,255,0.6)';
  const cardColor = settings.loginCardColor || colors.card;
  const labelColor = settings.loginLabelColor || colors.foreground;
  const hintColor = settings.loginHintColor || colors.mutedForeground;
  const buttonColor = settings.loginButtonColor || colors.accent;
  const buttonTextColor = settings.loginButtonTextColor || '#fff';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const handleGoogle = async () => {
    setError('');
    setBusy(true);
    const res = await loginWithGoogle();
    setBusy(false);
    if (!res.ok) setError(res.error ?? 'Sign-in failed.');
    // on success the root layout navigates automatically
  };

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[styles.scroll, { paddingTop: topPad + 60 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoWrap}>
          <Image
            source={settings.loginIconUri ? { uri: settings.loginIconUri } : require('@/assets/images/icon.png')}
            style={styles.logo}
          />
          <Text style={[styles.title, { color: titleColor }]}>{settings.appTitle}</Text>
          <Text style={[styles.subtitle, { color: subColor }]}>{settings.loginSubtitle}</Text>
        </View>

        <View style={[styles.cardBox, { backgroundColor: cardColor }]}>
          <Text style={[styles.label, { color: labelColor }]}>
            {settings.loginLabelText}
          </Text>
          <Text style={[styles.hint, { color: hintColor, marginTop: 0, marginBottom: 12 }]}>
            {settings.loginHintText}
          </Text>
          <Pressable
            onPress={handleGoogle}
            disabled={busy}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: buttonColor },
              (pressed || busy) && { opacity: 0.8 },
            ]}
            testID="login-google"
          >
            <Feather name="log-in" size={18} color={buttonTextColor} />
            <Text style={[styles.buttonText, { color: buttonTextColor }]}>
              {busy ? 'SIGNING IN…' : settings.loginButtonText}
            </Text>
          </Pressable>
          {!!error && <Text style={[styles.error, { marginTop: 12 }]}>{error}</Text>}
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingBottom: 60 },
  logoWrap: { alignItems: 'center', marginBottom: 32 },
  logo: { width: 84, height: 84, borderRadius: 20, marginBottom: 16 },
  title: {
    color: '#fff',
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 2,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 4,
  },
  cardBox: { borderRadius: 16, padding: 20 },
  label: { fontSize: 16, fontFamily: 'Inter_600SemiBold', marginBottom: 10 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 13,
    marginTop: 4,
  },
  buttonText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  hint: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 10, lineHeight: 18 },
  error: { color: '#D6403A', fontSize: 13, fontFamily: 'Inter_500Medium', marginBottom: 6 },
});