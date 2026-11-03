# JENNY — PWA(iOS/모바일 웹) 대응 변경 내역

기준: `Jenny_App_V1.04.1040.zip`
원칙: Android 경로(`Platform.OS !== 'web'`)는 한 줄도 동작이 바뀌지 않게 했고, 공통 비즈니스 로직(AppContext 등), 공통 스타일, 함수 구조는 건드리지 않았다. 삭제된 기능은 없다.

---

## 1. 새로 추가한 파일 (웹/PWA 전용)

| 파일 | 역할 / 이유 |
|---|---|
| `app/+html.tsx` | Expo Router의 웹 전용 루트 HTML이다. 네이티브 빌드에서는 무시된다. viewport(`viewport-fit=cover`, 확대 금지 → iOS 입력창 자동 확대 방지), manifest 링크, theme-color, iOS 홈 화면 메타(`apple-mobile-web-app-*`), apple-touch-icon, 서비스워커 등록 스크립트, 앱처럼 동작하게 하는 CSS(바운스/당겨서 새로고침/롱프레스 텍스트 선택 방지)를 넣었다. |
| `public/manifest.json` | PWA manifest다. `display: standalone`, `start_url`/`scope` `/`, portrait, 아이콘(any + maskable)을 넣었다. Chrome/Brave 설치 조건을 충족한다. |
| `public/sw.js` | 서비스워커다. 설치 가능 조건과 재실행 속도를 위해 넣었다. HTML은 **network-first**라서 EAS 새 배포가 바로 반영된다. 해시 파일(`/_expo/static`, `/assets`)만 cache-first로 처리한다. Google Apps Script, 로그인, Drive 같은 외부 요청과 GET이 아닌 요청은 **절대 가로채지 않는다**. 강제로 캐시를 비워야 하면 `CACHE_VERSION`을 올리면 된다. |
| `public/icons/*` | Android 앱 아이콘(`assets/images/icon.png`)으로 만든 PWA 아이콘이다: 192/512, maskable 192/512(안전영역 80%), apple-touch-icon 180(iOS는 투명 영역을 검게 칠해서 배경을 채웠다), favicon 32. |
| `components/WebBarcodeScanner.web.tsx` | 웹 전용 카메라 스캐너다. `getUserMedia`로 후면 카메라를 inline `<video>`(muted/playsinline, iOS 대응)에 띄운다. 디코딩은 Chrome/Brave Android의 네이티브 `BarcodeDetector`를 쓰고, iOS처럼 지원하지 않는 브라우저에서는 ZXing(버전 고정 CDN, SW가 캐시)을 쓴다. 포맷은 네이티브와 똑같이 UPC-A/E, EAN-13/8, Code128/39다. **카메라 유지와 복구**: 백그라운드로 가면 카메라를 해제한다. foreground 복귀(visibilitychange/pageshow/focus/resume) 때 자동으로 다시 켠다. 1.5초 워치독이 트랙 종료, 영상 멈춤, 2.5초 넘는 mute(iOS 중단)를 감지해서 재시작한다. 실패하면 백오프 후 재시도한다. 권한이 거부되면 안내를 띄우고 탭하면 재시도한다. |
| `components/WebBarcodeScanner.tsx` | 네이티브용 빈 stub(`null` 반환, `isWebCameraSupported()=false`)이다. Metro의 `.web.tsx` 플랫폼 확장자 규칙 덕분에 Android 번들에는 웹 스캐너 코드가 들어가지 않는다. |
| `lib/pwa.ts` | `isPwaMobileLayout()` 함수다. 웹이면서 **설치된 PWA이거나 폰 브라우저**일 때만 true를 반환한다. 네이티브에서는 항상 false라서 Android에 영향이 없다. 데스크톱 브라우저는 기존 웹 레이아웃을 그대로 쓴다. |

## 2. 수정한 기존 파일 (전부 웹 분기 조건만 바꿨다)

| 파일 | 수정 | 이유 |
|---|---|---|
| `app/(tabs)/scan.tsx` | import 2줄 추가. 웹 분기 안에서 카메라를 지원하면 `WebBarcodeScanner`를 쓰고, 지원하지 않으면 **기존 안내 화면을 그대로** 쓴다. topPad 웹 조건을 바꿨다. | PWA 카메라 스캔 때문이다. 스캔 결과는 기존 `handleBarcode`로 그대로 넘어가서 중복 방지(3초), 벤더 체크, 스캔리스트 추가가 동일하게 동작한다. Android의 `CameraView` 분기는 그대로 뒀다. |
| `app/(tabs)/cart.tsx`, `settings.tsx`, `purchase.tsx`, `app/login.tsx` | `topPad` 웹 조건을 `Platform.OS === 'web' && !isPwaMobileLayout()`로 바꿨다. | 모바일 웹/PWA에서 기존 데스크톱용 67px 대신 Android와 같은 `insets.top`을 쓰게 하려고 바꿨다. |
| `app/(tabs)/index.tsx` | `topPad`와 버튼 영역의 웹 전용 스타일 2곳에 같은 조건을 넣었다. | 모바일 웹/PWA에서 HOME 4버튼 위치를 Android와 같게(세로 중앙, translateY -40) 맞추려고 바꿨다. |

`app.json`, `package.json`, `package-lock.json`, `eas.json`, `AppContext.tsx`, 공통 컴포넌트와 스타일은 **변경하지 않았다**. 새 npm 의존성도 추가하지 않았다. lockfile이 그대로라서 Android EAS Build에 영향이 없다.

---

## 3. 기존 파일 변경 내용 ([찾기] → [바꾸기])

### app/(tabs)/scan.tsx
[찾기]
```tsx
import ItemCard from '@/components/ItemCard';
```
[바꾸기]
```tsx
import ItemCard from '@/components/ItemCard';
// web/PWA only: native builds resolve this to a no-op stub (WebBarcodeScanner.tsx)
import WebBarcodeScanner, { isWebCameraSupported } from '@/components/WebBarcodeScanner';
import { isPwaMobileLayout } from '@/lib/pwa';
```

[찾기]
```tsx
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
```
[바꾸기]
```tsx
  const topPad = Platform.OS === 'web' && !isPwaMobileLayout() ? 67 : insets.top; // mobile web/PWA → Android layout
```

[찾기]
```tsx
            {Platform.OS === 'web' ? (
              <View style={[styles.webCameraFallback, { backgroundColor: colors.muted }]}>
                <MaterialCommunityIcons name="barcode-scan" size={32} color={colors.mutedForeground} />
                <Text style={[styles.webCameraText, { color: colors.mutedForeground }]}>
                  Barcode scanning works on your phone{'\n'}Type a UPC in the search box below
                </Text>
              </View>
            ) : (
```
[바꾸기]
```tsx
            {Platform.OS === 'web' ? (
              isWebCameraSupported() ? (
                // PWA / web: getUserMedia camera + barcode decoding (web only)
                <WebBarcodeScanner style={styles.camera} onBarcodeScanned={handleBarcode} />
              ) : (
              <View style={[styles.webCameraFallback, { backgroundColor: colors.muted }]}>
                <MaterialCommunityIcons name="barcode-scan" size={32} color={colors.mutedForeground} />
                <Text style={[styles.webCameraText, { color: colors.mutedForeground }]}>
                  Barcode scanning works on your phone{'\n'}Type a UPC in the search box below
                </Text>
              </View>
              )
            ) : (
```

### app/(tabs)/cart.tsx, app/(tabs)/settings.tsx, app/(tabs)/purchase.tsx, app/login.tsx (4개 파일 동일)
[찾기]
```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';
```
[바꾸기]
```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isPwaMobileLayout } from '@/lib/pwa';
```

[찾기]
```tsx
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
```
[바꾸기]
```tsx
  const topPad = Platform.OS === 'web' && !isPwaMobileLayout() ? 67 : insets.top; // mobile web/PWA → Android layout
```

### app/(tabs)/index.tsx
[찾기]
```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';
```
[바꾸기]
```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isPwaMobileLayout } from '@/lib/pwa';
```

[찾기]
```tsx
  const topPad = Platform.OS === 'web' ? 0 : insets.top;
```
[바꾸기]
```tsx
  const topPad = Platform.OS === 'web' && !isPwaMobileLayout() ? 0 : insets.top; // mobile web/PWA → Android layout
```

[찾기]
```tsx
        <View style={[styles.buttonArea, Platform.OS === 'web' && {justifyContent: 'flex-end', paddingBottom: 56,}]}>
        <View style={[styles.buttonGrid, Platform.OS === 'web' && { transform: [{ translateY: 0 }] }]}>
```
[바꾸기]
```tsx
        <View style={[styles.buttonArea, Platform.OS === 'web' && !isPwaMobileLayout() && {justifyContent: 'flex-end', paddingBottom: 56,}]}>
        <View style={[styles.buttonGrid, Platform.OS === 'web' && !isPwaMobileLayout() && { transform: [{ translateY: 0 }] }]}>
```

---

## 4. 배포 (EAS Hosting 그대로)

```bash
npx expo export -p web     # public/ 내용(manifest, sw.js, icons)이 dist/ 루트로 복사된다
eas deploy --prod
```
※ zip 안의 기존 `dist/`는 옛 빌드 결과물이다. export하면 새로 만들어진다.

## 5. 설치 / 테스트

- **Android Chrome/Brave**: 사이트 접속 → 메뉴 → "앱 설치"(또는 "홈 화면에 추가") → 아이콘으로 실행하면 standalone으로 열린다.
- **iPhone**: Safari로 접속 → 공유 → "홈 화면에 추가" → 아이콘으로 실행한다.
- SCAN 탭: 처음에 카메라 권한을 허용한다. 홈 화면으로 나갔다가 돌아오면 카메라가 자동으로 다시 켜지는지 확인한다.
- 카메라는 HTTPS에서만 동작한다(EAS Hosting은 HTTPS라서 문제없다).

## 6. 알아둘 점

- iOS 홈 화면 PWA는 iOS 버전에 따라 실행할 때마다 카메라 권한을 다시 물을 수 있다(iOS 정책이다).
- iOS 웹은 Haptics(진동)를 지원하지 않는다. 기존 코드도 웹에서는 Haptics를 건너뛰고 있다.
- iOS에서 처음 SCAN을 열 때 ZXing 디코더(약 400KB)를 CDN에서 한 번 받는다. 그다음부터는 서비스워커 캐시를 쓴다. Android Chrome은 내장 BarcodeDetector를 써서 다운로드가 없다.
