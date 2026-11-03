// PWA helpers — web only. On Android / iOS native every function returns
// false, so native layouts and behaviour are untouched.
import { Platform } from 'react-native';

/**
 * true when the web build runs as an installed PWA or in a phone browser.
 * In that case the screens use the Android (native) layout values
 * (safe-area insets) instead of the desktop-web values.
 * Desktop browsers keep the previous web layout.
 */
export function isPwaMobileLayout(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    const mm = (q: string) => !!window.matchMedia && window.matchMedia(q).matches;
    if (mm('(display-mode: standalone)') || (window.navigator as any).standalone === true) {
      return true;
    }
    const narrow = Math.min(window.innerWidth || 0, window.screen?.width || Infinity) <= 820;
    return mm('(pointer: coarse)') && narrow;
  } catch {
    return false;
  }
}
