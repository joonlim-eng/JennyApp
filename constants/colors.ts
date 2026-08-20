/**
 * Semantic design tokens — JENNY order app.
 * Multiple selectable themes; the active theme is chosen in SETTING.
 */

const base = {
  text: '#0E1B2C',
  background: '#F5F7FA',
  foreground: '#0E1B2C',
  card: '#FFFFFF',
  cardForeground: '#0E1B2C',
  primaryForeground: '#FFFFFF',
  secondary: '#E8EEF4',
  secondaryForeground: '#122A4A',
  muted: '#EDF1F5',
  mutedForeground: '#5B6B7C',
  accentForeground: '#FFFFFF',
  destructive: '#D6403A',
  destructiveForeground: '#FFFFFF',
  border: '#DDE4EB',
  input: '#DDE4EB',
  success: '#1B8A5A',
  warning: '#C77D0A',
  inCart: '#D6403A',
};

export type Palette = typeof base & {
  tint: string;
  primary: string;
  accent: string;
  totalCard?: string; // TOTAL card default color when it differs from primary
  totalLabel?: string; // "TOTAL" text color inside the card (default: translucent white)
  // HOME action button defaults when they differ from primary/accent/success
  sendBtn?: string;
  saveBtn?: string;
  saveBtnBorder?: string;
  loadBtn?: string;
  exportBtn?: string;
  actionBtnText?: string; // label color inside the 4 HOME buttons (default white)
  actionBtnIcon?: string; // icon color inside the 4 HOME buttons (default white)
};

//accent / tint = SEND, ORDER LOAD  #7B7B7B
export const themes: Record<string, Palette> = {
  navy: { ...base, primary: '#122A4A', accent: '#0E7C86', tint: '#0E7C86' },
  rose: {
    ...base,
    primary: '#7A1F3D',
    accent: '#C2185B',
    tint: '#C2185B',
    totalCard: '#D5B8B6',
    totalLabel: '#7A1F3D', // matches the JENNY brand title (primary)
    sendBtn: '#E3C2BE',
    loadBtn: '#E3C2BE',
    exportBtn: '#EAD0CC',   //excel color
    saveBtn: '#D2A3A4',
    saveBtnBorder: '#FFD54F', // thin yellow outline on SAVE
    actionBtnText: '#C2185B', // theme magenta (accent)
    actionBtnIcon: '#7A1F3D', // burgundy icons
    secondary: '#F6E3EA',
    secondaryForeground: '#7A1F3D',
  },
  forest: {
    ...base,
    primary: '#1E3D2F',
    accent: '#2E7D32',
    tint: '#2E7D32',
    secondary: '#E4EEE6',
    secondaryForeground: '#1E3D2F',
  },
  plum: {
    ...base,
    primary: '#3A2352',
    accent: '#C993FF',
    tint: '#C993FF',
    exportBtn: '#AED395',   //excel color
    secondary: '#ECE4F4', 
    secondaryForeground: '#3A2352',
  },
  slate: {
    ...base,
    primary: '#263238',
    accent: '#546E7A',
    tint: '#546E7A',
    secondary: '#E7EBED',
    secondaryForeground: '#263238',
  },
};

export const themeNames = Object.keys(themes);

const colors = {
  light: themes.navy,
  radius: 12,
};

export default colors;
