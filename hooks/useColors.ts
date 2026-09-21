import colors, { themes } from '@/constants/colors';
import { useOptionalApp } from '@/context/AppContext';

/**
 * Returns the design tokens for the active theme selected in SETTING.
 * Falls back to the default (navy) palette when used outside AppProvider
 * (e.g. the error fallback screen).
 */
export function useColors() {
  const app = useOptionalApp();
  // 시트에서 동기화되는 app.appearance['global.theme']을 우선 참조
  const themeName = app?.appearance['global.theme'] || app?.settings.theme || 'navy';
  const palette = themes[themeName] ?? colors.light;
  return { ...palette, radius: colors.radius };
}