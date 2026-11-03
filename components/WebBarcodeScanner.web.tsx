// Web / PWA barcode scanner (bundled ONLY for the web build — the Android app
// keeps using expo-camera's <CameraView>; see WebBarcodeScanner.tsx stub).
//
// - Camera: navigator.mediaDevices.getUserMedia (rear camera, inline <video>).
// - Decoding: native BarcodeDetector when the browser has it (Chrome/Brave on
//   Android). Otherwise (iOS Safari / iOS PWA) the ZXing decoder is loaded once
//   from a version-pinned CDN URL (cached by the service worker afterwards).
// - Keeps the camera alive while the SCAN screen is shown, and automatically
//   restores it when the PWA comes back to the foreground (visibilitychange,
//   pageshow, focus, resume) or when the browser kills the video track.
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { WebBarcodeScannerProps } from './WebBarcodeScanner';

export type { WebBarcodeScannerProps } from './WebBarcodeScanner';

const ZXING_URLS = [
  'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js',
  'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js',
];

// Same symbologies as the native CameraView barcodeScannerSettings.
const NATIVE_FORMATS = ['upc_a', 'upc_e', 'ean_13', 'ean_8', 'code_128', 'code_39'];

const SCAN_INTERVAL_NATIVE_MS = 100;
const SCAN_INTERVAL_ZXING_MS = 140;
const WATCHDOG_MS = 1500;
const MUTED_RESTART_MS = 2500;
const MAX_DECODE_WIDTH = 960;

export function isWebCameraSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (window.isSecureContext === false) return false;
  return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
}

type Hit = { data: string; type?: string } | null;
type Decoder = (video: HTMLVideoElement) => Promise<Hit>;

let zxingPromise: Promise<any> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve();
    s.onerror = () => {
      s.remove();
      reject(new Error('load failed: ' + src));
    };
    document.head.appendChild(s);
  });
}

function loadZxing(): Promise<any> {
  const w = window as any;
  if (w.ZXing) return Promise.resolve(w.ZXing);
  if (!zxingPromise) {
    zxingPromise = (async () => {
      for (const url of ZXING_URLS) {
        try {
          await loadScript(url);
          if (w.ZXing) return w.ZXing;
        } catch {
          // try next mirror
        }
      }
      throw new Error('Barcode decoder could not be loaded');
    })();
    zxingPromise.catch(() => {
      zxingPromise = null; // allow a later retry
    });
  }
  return zxingPromise;
}

async function createNativeDecoder(): Promise<Decoder | null> {
  const BD = (window as any).BarcodeDetector;
  if (!BD) return null;
  try {
    const supported: string[] = (await BD.getSupportedFormats?.()) ?? [];
    const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
    if (!formats.includes('ean_13') && !formats.includes('upc_a')) return null;
    const detector = new BD({ formats });
    return async (video) => {
      const res = await detector.detect(video);
      const first = res && res[0];
      return first && first.rawValue ? { data: String(first.rawValue), type: first.format } : null;
    };
  } catch {
    return null;
  }
}

async function createZxingDecoder(): Promise<Decoder> {
  const ZX = await loadZxing();
  const hints = new Map();
  hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [
    ZX.BarcodeFormat.UPC_A,
    ZX.BarcodeFormat.UPC_E,
    ZX.BarcodeFormat.EAN_13,
    ZX.BarcodeFormat.EAN_8,
    ZX.BarcodeFormat.CODE_128,
    ZX.BarcodeFormat.CODE_39,
  ]);
  hints.set(ZX.DecodeHintType.TRY_HARDER, true);
  const reader = new ZX.MultiFormatReader();
  reader.setHints(hints);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D | null;

  return async (video) => {
    if (!ctx) return null;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;

    // Decode only the part of the frame that is visible in the camera box
    // (object-fit: cover), like the native preview.
    const hasBox = video.clientWidth > 0 && video.clientHeight > 0;
    const bw = hasBox ? video.clientWidth : vw;
    const bh = hasBox ? video.clientHeight : vh;
    const boxRatio = bw / bh;
    const vidRatio = vw / vh;
    let sx = 0;
    let sy = 0;
    let sw = vw;
    let sh = vh;
    if (vidRatio > boxRatio) {
      sw = vh * boxRatio;
      sx = (vw - sw) / 2;
    } else {
      sh = vw / boxRatio;
      sy = (vh - sh) / 2;
    }
    const scale = Math.min(1, MAX_DECODE_WIDTH / sw);
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = Math.max(1, Math.round(sh * scale));
    if (canvas.width !== dw) canvas.width = dw;
    if (canvas.height !== dh) canvas.height = dh;
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh);

    const rgba = ctx.getImageData(0, 0, dw, dh).data;
    const lum = new Uint8ClampedArray(dw * dh);
    for (let i = 0, j = 0; j < lum.length; i += 4, j++) {
      lum[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
    }
    try {
      const source = new ZX.RGBLuminanceSource(lum, dw, dh);
      const bitmap = new ZX.BinaryBitmap(new ZX.HybridBinarizer(source));
      const result = reader.decodeWithState(bitmap);
      const text = result?.getText?.();
      return text ? { data: String(text), type: String(result.getBarcodeFormat?.() ?? '') } : null;
    } catch {
      return null; // NotFound / checksum / format errors → nothing this frame
    } finally {
      try {
        reader.reset();
      } catch {
        // ignore
      }
    }
  };
}

type Status = 'starting' | 'live' | 'denied' | 'nocamera' | 'unsupported' | 'error';

export default function WebBarcodeScanner({ style, onBarcodeScanned }: WebBarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onScanRef = useRef(onBarcodeScanned);
  const restartRef = useRef<() => void>(() => {});
  const [status, setStatus] = useState<Status>(() => (isWebCameraSupported() ? 'starting' : 'unsupported'));

  useEffect(() => {
    onScanRef.current = onBarcodeScanned;
  }, [onBarcodeScanned]);

  useEffect(() => {
    if (!isWebCameraSupported()) {
      setStatus('unsupported');
      return;
    }

    let alive = true;
    let stream: MediaStream | null = null;
    let starting = false;
    let startSeq = 0;
    let failCount = 0;
    let decoder: Decoder | null = null;
    let decoderPromise: Promise<Decoder | null> | null = null;
    let scanTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let mutedSince = 0;
    let scanBusy = false;
    let scanInterval = SCAN_INTERVAL_ZXING_MS;

    const isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

    const getTrack = () => (stream ? stream.getVideoTracks()[0] ?? null : null);

    const stopStream = () => {
      if (stream) {
        stream.getTracks().forEach((t) => {
          t.onended = null;
          t.onmute = null;
          t.onunmute = null;
          try {
            t.stop();
          } catch {
            // ignore
          }
        });
      }
      stream = null;
      mutedSince = 0;
      const v = videoRef.current;
      if (v) {
        try {
          v.pause();
        } catch {
          // ignore
        }
        v.srcObject = null;
      }
    };

    const ensureDecoder = () => {
      if (decoder) return Promise.resolve(decoder);
      if (!decoderPromise) {
        decoderPromise = (async () => {
          const native = await createNativeDecoder();
          if (native) {
            scanInterval = SCAN_INTERVAL_NATIVE_MS;
            return native;
          }
          scanInterval = SCAN_INTERVAL_ZXING_MS;
          return createZxingDecoder();
        })()
          .then((d) => {
            decoder = d;
            return d;
          })
          .catch(() => {
            decoderPromise = null; // retry on the next tick
            return null;
          });
      }
      return decoderPromise;
    };

    const scheduleScan = (delay: number) => {
      if (scanTimer) clearTimeout(scanTimer);
      scanTimer = setTimeout(scanTick, delay);
    };

    const scanTick = async () => {
      scanTimer = null;
      if (!alive) return;
      const v = videoRef.current;
      if (!stream || !v || !isVisible() || v.readyState < 2 || scanBusy) {
        scheduleScan(scanInterval);
        return;
      }
      const d = decoder ?? (await ensureDecoder());
      if (!alive) return;
      if (!d) {
        scheduleScan(1000);
        return;
      }
      scanBusy = true;
      try {
        const hit = await d(v);
        if (alive && hit && hit.data) onScanRef.current({ data: hit.data, type: hit.type });
      } catch {
        // ignore a failed frame
      } finally {
        scanBusy = false;
      }
      if (alive) scheduleScan(scanInterval);
    };

    const scheduleRestart = (delay: number) => {
      if (!alive) return;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        start();
      }, delay);
    };

    const start = async () => {
      if (!alive || starting || !isVisible()) return;
      starting = true;
      const seq = ++startSeq;
      stopStream();
      setStatus((s) => (s === 'live' ? s : 'starting'));

      let next: MediaStream | null = null;
      try {
        try {
          next = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          });
        } catch (e: any) {
          if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw e;
          // over-constrained / odd device → retry with the simplest request
          next = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        }
      } catch (e: any) {
        if (!alive || seq !== startSeq) return; // superseded by a newer start
        starting = false;
        const name = e?.name ?? '';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setStatus('denied');
          return;
        }
        if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          setStatus('nocamera');
          return;
        }
        failCount += 1;
        setStatus('error');
        scheduleRestart(Math.min(5000, 600 * failCount));
        return;
      }

      if (!alive || seq !== startSeq || !isVisible()) {
        next.getTracks().forEach((t) => t.stop());
        if (seq === startSeq) starting = false;
        return;
      }

      stream = next;
      const track = getTrack();
      if (track) {
        track.onended = () => {
          if (alive && stream === next) scheduleRestart(300);
        };
        track.onmute = () => {
          mutedSince = Date.now();
        };
        track.onunmute = () => {
          mutedSince = 0;
        };
        // continuous autofocus where supported (Chrome Android)
        try {
          const caps: any = (track as any).getCapabilities?.();
          if (caps?.focusMode?.includes?.('continuous')) {
            track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] }).catch(() => {});
          }
        } catch {
          // ignore
        }
      }

      const v = videoRef.current;
      if (v) {
        v.muted = true;
        v.setAttribute('muted', '');
        v.setAttribute('playsinline', '');
        v.setAttribute('webkit-playsinline', '');
        v.srcObject = stream;
        try {
          await v.play();
        } catch {
          // autoplay hiccup — the watchdog calls play() again
        }
      }

      if (!alive || seq !== startSeq) return; // hidden / restarted while play() was pending
      starting = false;
      failCount = 0;
      setStatus('live');
      ensureDecoder();
      scheduleScan(scanInterval);
    };

    restartRef.current = () => {
      failCount = 0;
      start();
    };

    // health check: restore a dead / paused / frozen camera
    const watchdog = setInterval(() => {
      if (!alive || starting || !isVisible()) return;
      const track = getTrack();
      const v = videoRef.current;
      if (!stream || !track || track.readyState === 'ended') {
        if (!retryTimer) start();
        return;
      }
      if (mutedSince && Date.now() - mutedSince > MUTED_RESTART_MS) {
        start();
        return;
      }
      if (v && v.paused) v.play().catch(() => {});
    }, WATCHDOG_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // release the camera in the background (iOS kills it anyway)
        startSeq++;
        starting = false;
        stopStream();
      } else {
        failCount = 0;
        start();
      }
    };
    const onPageShow = () => {
      if (!stream || getTrack()?.readyState !== 'live') start();
    };
    const onFocus = () => {
      const track = getTrack();
      if (!stream || !track || track.readyState !== 'live') start();
      else videoRef.current?.play().catch(() => {});
    };

    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('resume', onFocus as any);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onFocus);

    start();

    return () => {
      alive = false;
      startSeq++;
      clearInterval(watchdog);
      if (scanTimer) clearTimeout(scanTimer);
      if (retryTimer) clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('resume', onFocus as any);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onFocus);
      stopStream();
      restartRef.current = () => {};
    };
  }, []);

  const message =
    status === 'denied'
      ? 'Camera permission denied.\nAllow camera access for this site, then tap here.'
      : status === 'nocamera'
        ? 'No camera found.\nType a UPC in the search box below'
        : status === 'unsupported'
          ? 'Camera needs HTTPS.\nType a UPC in the search box below'
          : status === 'error'
            ? 'Starting camera…\nTap to retry'
            : '';

  return (
    <View style={[styles.root, style]}>
      {React.createElement('video', {
        ref: videoRef,
        autoPlay: true,
        muted: true,
        playsInline: true,
        disablePictureInPicture: true,
        style: {
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          backgroundColor: '#000',
          pointerEvents: 'none',
        },
      })}
      {!!message && (
        <Pressable style={styles.overlay} onPress={() => restartRef.current()}>
          <Text style={styles.overlayText}>{message}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  overlayText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 18,
  },
});
