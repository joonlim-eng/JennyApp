// Vector icons drawn as inline SVG — no font downloads, so they can never
// render as □ on devices. Drop-in replacements for @expo/vector-icons'
// Feather and MaterialCommunityIcons components (name/size/color props).
import React from 'react';
import Svg, { Circle, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';

type IconProps = {
  name: string;
  size?: number;
  color?: string;
  style?: any;
};

function S({ size = 24, color = '#000', style, children }: any) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {children}
    </Svg>
  );
}

const FEATHER: Record<string, React.ReactNode> = {
  'alert-circle': (
    <>
      <Circle cx={12} cy={12} r={10} />
      <Line x1={12} y1={8} x2={12} y2={12} />
      <Line x1={12} y1={16} x2={12.01} y2={16} />
    </>
  ),
  'chevron-down': <Polyline points="6 9 12 15 18 9" />,
  'chevron-up': <Polyline points="18 15 12 9 6 15" />,
  download: (
    <>
      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <Polyline points="7 10 12 15 17 10" />
      <Line x1={12} y1={15} x2={12} y2={3} />
    </>
  ),
  home: (
    <>
      <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <Polyline points="9 22 9 12 15 12 15 22" />
    </>
  ),
  key: (
    <Path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
  ),
  lock: (
    <>
      <Rect x={3} y={11} width={18} height={11} rx={2} ry={2} />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  'log-in': (
    <>
      <Path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <Polyline points="10 17 15 12 10 7" />
      <Line x1={15} y1={12} x2={3} y2={12} />
    </>
  ),
  'log-out': (
    <>
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <Polyline points="16 17 21 12 16 7" />
      <Line x1={21} y1={12} x2={9} y2={12} />
    </>
  ),
  minus: <Line x1={5} y1={12} x2={19} y2={12} />,
  plus: (
    <>
      <Line x1={12} y1={5} x2={12} y2={19} />
      <Line x1={5} y1={12} x2={19} y2={12} />
    </>
  ),
  'refresh-cw': (
    <>
      <Polyline points="23 4 23 10 17 10" />
      <Polyline points="1 20 1 14 7 14" />
      <Path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </>
  ),
  save: (
    <>
      <Path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <Polyline points="17 21 17 13 7 13 7 21" />
      <Polyline points="7 3 7 8 15 8" />
    </>
  ),
  search: (
    <>
      <Circle cx={11} cy={11} r={8} />
      <Line x1={21} y1={21} x2={16.65} y2={16.65} />
    </>
  ),
  send: (
    <>
      <Line x1={22} y1={2} x2={11} y2={13} />
      <Polygon points="22 2 15 22 11 13 2 9 22 2" />
    </>
  ),
  settings: (
    <>
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  'shopping-cart': (
    <>
      <Circle cx={9} cy={21} r={1} />
      <Circle cx={20} cy={21} r={1} />
      <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </>
  ),
  'trash-2': (
    <>
      <Polyline points="3 6 5 6 21 6" />
      <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <Line x1={10} y1={11} x2={10} y2={17} />
      <Line x1={14} y1={11} x2={14} y2={17} />
    </>
  ),
  x: (
    <>
      <Line x1={18} y1={6} x2={6} y2={18} />
      <Line x1={6} y1={6} x2={18} y2={18} />
    </>
  ),
  users: (
    <>
      <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <Circle cx={9} cy={7} r={4} />
      <Path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  link: (
    <>
      <Path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <Path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  sliders: (
    <>
      <Line x1={4} y1={21} x2={4} y2={14} />
      <Line x1={4} y1={10} x2={4} y2={3} />
      <Line x1={12} y1={21} x2={12} y2={12} />
      <Line x1={12} y1={8} x2={12} y2={3} />
      <Line x1={20} y1={21} x2={20} y2={16} />
      <Line x1={20} y1={12} x2={20} y2={3} />
      <Line x1={1} y1={14} x2={7} y2={14} />
      <Line x1={9} y1={8} x2={15} y2={8} />
      <Line x1={17} y1={16} x2={23} y2={16} />
    </>
  ),
  camera: (
    <>
      <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <Circle cx={12} cy={13} r={4} />
    </>
  ),
  'camera-off': (
    <>
      <Line x1={1} y1={1} x2={23} y2={23} />
      <Path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56" />
    </>
  ),
};

const MCI: Record<string, React.ReactNode> = {
  'barcode-scan': (
    <>
      <Path d="M2 7V3h4M18 3h4v4M22 17v4h-4M6 21H2v-4" strokeWidth={2} />
      <Line x1={6.5} y1={8} x2={6.5} y2={16} />
      <Line x1={10} y1={8} x2={10} y2={16} />
      <Line x1={13.5} y1={8} x2={13.5} y2={16} />
      <Line x1={17.5} y1={8} x2={17.5} y2={16} />
    </>
  ),
  'cart-outline': (
    <>
      <Circle cx={9} cy={21} r={1} />
      <Circle cx={20} cy={21} r={1} />
      <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </>
  ),
  'cart-remove': (
    <>
      <Circle cx={9} cy={21} r={1} />
      <Circle cx={20} cy={21} r={1} />
      <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      <Line x1={11} y1={9} x2={16} y2={14} />
      <Line x1={16} y1={9} x2={11} y2={14} />
    </>
  ),
  'magnify-scan': (
    <>
      <Path d="M2 7V3h4M18 3h4v4M22 17v4h-4M6 21H2v-4" />
      <Circle cx={11.5} cy={11.5} r={4.5} />
      <Line x1={15} y1={15} x2={18} y2={18} />
    </>
  ),
  'microsoft-excel': (
    <>
      <Rect x={3} y={3} width={18} height={18} rx={2} />
      <Line x1={9} y1={3} x2={9} y2={21} />
      <Line x1={3} y1={9} x2={21} y2={9} />
      <Line x1={3} y1={15} x2={21} y2={15} />
      <Line x1={15} y1={3} x2={15} y2={21} />
    </>
  ),
  'package-variant-closed': (
    <>
      <Path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <Polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <Line x1={12} y1={22.08} x2={12} y2={12} />
    </>
  ),
  camera: (
    <>
      <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <Circle cx={12} cy={13} r={4} />
    </>
  ),
  'camera-off': (
    <>
      <Line x1={1} y1={1} x2={23} y2={23} />
      <Path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56" />
    </>
  ),
};

function makeIconComponent(map: Record<string, React.ReactNode>, label: string) {

  return function Icon({ name, size = 24, color = '#000', style }: IconProps) {

    const glyph = map[name];

    if (!glyph) {

      if (__DEV__) console.warn(`AppIcon: missing ${label} icon "${name}"`);

      return <S size={size} color={color} style={style}><Circle cx={12} cy={12} r={9} /></S>;

    }

    return <S size={size} color={color} style={style}>{glyph}</S>;

  };

} 



export const Feather = makeIconComponent(FEATHER, 'Feather');
export const MaterialCommunityIcons = makeIconComponent(MCI, 'MaterialCommunityIcons');
