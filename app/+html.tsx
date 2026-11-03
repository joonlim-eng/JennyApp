// Web-only root HTML (Expo Router). This file is ignored by the Android / iOS
// native builds — it only shapes the <head> of the static web export that is
// deployed to EAS Hosting, so the site can be installed as a PWA.
import React, { type PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

// App-like behaviour for the installed PWA. Only touches html/body/#root and
// form fields — never the React Native styles used by the screens.
const pwaCss = `
html, body { background-color: #ffffff; overscroll-behavior: none; }
body {
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  touch-action: manipulation;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
input, textarea, [contenteditable="true"] {
  -webkit-user-select: text;
  user-select: text;
  -webkit-touch-callout: default;
}
video { -webkit-user-select: none; user-select: none; }
`;

// Register the service worker (installability + faster relaunch).
// Secure contexts only; failures are ignored so the site always works.
const swRegister = `
(function () {
  try {
    if (!('serviceWorker' in navigator)) return;
    if (!window.isSecureContext) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {});
    });
  } catch (e) {}
})();
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* Fixed mobile viewport like the native app: no pinch / input auto-zoom,
            and content may extend under the notch / home indicator so the
            safe-area insets (env()) behave like Android's edge-to-edge insets. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <title>JENNY</title>

        {/* PWA manifest + install metadata */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#ffffff" />
        <meta name="application-name" content="JENNY" />
        <meta name="mobile-web-app-capable" content="yes" />

        {/* iOS "Add to Home Screen" → standalone app */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="JENNY" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />

        {/* Icons */}
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />

        {/* Disable body scrolling on web so ScrollView behaves like native. */}
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: pwaCss }} />
        <script dangerouslySetInnerHTML={{ __html: swRegister }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
