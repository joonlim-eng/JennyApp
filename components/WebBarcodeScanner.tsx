// Native (Android / iOS) stub.
// The real implementation lives in WebBarcodeScanner.web.tsx and is only
// bundled for the web / PWA build. Native builds keep using expo-camera's
// <CameraView> in app/(tabs)/scan.tsx exactly as before.
import type { StyleProp, ViewStyle } from 'react-native';

export type WebBarcodeScannerProps = {
  style?: StyleProp<ViewStyle>;
  onBarcodeScanned: (result: { data: string; type?: string }) => void;
};

export function isWebCameraSupported(): boolean {
  return false;
}

export default function WebBarcodeScanner(_props: WebBarcodeScannerProps) {
  return null;
}
