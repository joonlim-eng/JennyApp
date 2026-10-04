// 최종 수정: 2026-10-04 09:22 AM(CT) 배포   //7 DOLLAR AUTOMATION
var SS = SpreadsheetApp.getActiveSpreadsheet();
function doGet(e) {
  
  var action = (e && e.parameter && e.parameter.action) || '';
  
  // 구글이 로그인 완료 후 코드를 들고 돌아오는 요청인지 확인 (VIP 패스)
  var isOAuthRedirect = (e && e.parameter && e.parameter.code && !action);

  // 구글 복귀 요청이 아닐 때만 입구컷 검사 실행
  if (!isOAuthRedirect) {
    //입구컷 시작
    var shApp = SS.getSheetByName('APPEARANCE');
    var serverVer = shApp ? String(shApp.getRange('G1').getValue() || '').trim() : '';
    var clientVer = String((e && e.parameter && e.parameter.v) || '').trim();

    // x.x 까지만 추출하는 함수 (예: "1.2.3" -> "1.2")
    function getMajorMinor_(v) {
      var parts = v.split('.');
      return parts.length >= 2 ? parts[0] + '.' + parts[1] : v;
    }

    if (serverVer && getMajorMinor_(clientVer) !== getMajorMinor_(serverVer)) {
      return json_({ 
        ok: false, 
        error: 'UPDATE_REQUIRED', 
        message: 'Please update to the latest version' 
      });
    }
    //입구컷 완료
  }

  try {
    // Google 로그인 복귀 (VIP 패스로 들어온 경우 바로 리다이렉트 실행)
    if (isOAuthRedirect) return handleOAuthRedirect_(e);
    
    if (action === 'authcfg') {
      var cid = PropertiesService.getScriptProperties().getProperty('OAUTH_CLIENT_ID') || '';
      return json_({ clientId: cid, redirectUri: ScriptApp.getService().getUrl() });
    }
    if (action === 'authresult') {
      // one-time code → verified {email, role}; the app never trusts raw URL data
      var t = String(e.parameter.code || '');
      var cached = t ? CacheService.getScriptCache().get('auth_' + t) : null;
      if (!cached) return json_({ ok: false, error: 'invalid or expired code' });
      CacheService.getScriptCache().remove('auth_' + t);
      var data = JSON.parse(cached);
      return json_({ ok: true, email: data.email, role: data.role, n: data.n });
    }
    // ?vendor=NAME → 그 벤더 상품만 (벤더 선택 시 동기화 모드용), ?scope=light → 상품 제외 전체
    if (action === 'data') return json_(getData_(e.parameter.scope, e.parameter.vendor));
    if (action === 'users') return json_({ users: getUsers_() });
    if (action === 'user') {
      var email = String(e.parameter.email || '').trim().toLowerCase();
      var user = getUsers_().filter(function (u) { return u.email === email; })[0] || null;
      return json_({ user: user });
    }
    return json_({ ok: true, message: 'JENNY Apps Script is running. Use ?action=data|users|user' });
  } catch (err) {
    return json_({ error: String(err) });
  }
}
/* ============================== POST ============================= */

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

  //입구컷 시작
    var shApp = SS.getSheetByName('APPEARANCE');
    var serverVer = shApp ? String(shApp.getRange('G1').getValue() || '').trim() : '';
    var clientVer = String(body.v || (e && e.parameter && e.parameter.v) || '').trim();

    function getMajorMinor_(v) {
      var parts = v.split('.');
      return parts.length >= 2 ? parts[0] + '.' + parts[1] : v;
    }

    if (body.action !== 'checkUpdate' && serverVer && getMajorMinor_(clientVer) !== getMajorMinor_(serverVer)) {
      return json_({ 
        ok: false, 
        error: 'UPDATE REQUIRED', 
        message: 'Please update to the latest version' 
      });
    }
    //입구컷 완료

    if (body.action === 'checkUpdate') {
      var folderId = '0AFUXuwAbnKJtUk9PVA';
      var folder = DriveApp.getFolderById(folderId);
      var files = folder.getFiles();
      
      var latestVersion = "";
      var downloadUrl = "";
      
      while (files.hasNext()) {
        var file = files.next();
        var name = file.getName();
        
        var match = name.match(/v\d+\.\d+\.\d+/);
        if (match) {
          var version = match[0];
          
          if (version > latestVersion) {
            latestVersion = version;
            downloadUrl = file.getUrl(); 
          }
        }
      }
      
      return ContentService.createTextOutput(JSON.stringify({
        ok: true,
        latestVersion: latestVersion,
        downloadUrl: downloadUrl
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var action = body.action || 'order';
    if (action === 'requestAccess') return json_(requestAccess_(body));
    if (action === 'approveUser') return json_(approveUser_(body));
    if (action === 'activateUser') return json_(activateUser_(body));
    if (action === 'saveAppearance') return json_(saveAppearance_(body));
    if (action === 'forceLogout') return json_(forceLogout_());
    //08.05추가
    if (action === 'deleteUser' || action === 'removeUser') return json_(deleteUser_(body));
    //08.05 export 기능 추가
    if (action === 'export') return json_(recordExport_(body));
    //815일추가 import   923 수정
    if (action === 'getTabs') return json_(handleGetTabs_(body));
    if (action === 'import') return json_(handleImport_(body));
    if (action === 'deleteTab') return json_(handleDeleteTab_(body)); // 2-Step 삭제 로직 연결
    return json_(recordOrder_(body)); // default: order from the app
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ======================== GOOGLE LOGIN =========================== */
/**
 * 구글 OAuth 로그인 처리.
 * 준비물 (Apps Script 편집기 > 프로젝트 설정 > 스크립트 속성):
 *   OAUTH_CLIENT_ID     : 구글 클라우드 콘솔의 웹 클라이언트 ID
 *   OAUTH_CLIENT_SECRET : 같은 클라이언트의 비밀번호(Secret)
 * 구글 클라우드 콘솔의 '승인된 리디렉션 URI'에는 이 웹앱의 /exec URL을 등록.
 * USERS 시트: A=EMAIL, B=ROLE (master 또는 user). 여기 등록된 이메일만 접속 가능.
 */
function handleOAuthRedirect_(e) {
  var back = '';
  var nonce = '';
  try {
    var st = JSON.parse(
      Utilities.newBlob(Utilities.base64DecodeWebSafe(e.parameter.state || '')).getDataAsString(),
    );
    back = String(st.r || '');
    nonce = String(st.n || '');
  } catch (err) {}
  // only redirect back to the app itself (Expo Go, standalone app scheme, or Replit dev web)
  var okBack =
    back.indexOf('exp://') === 0 ||
    back.indexOf('exps://') === 0 ||
    back.indexOf('jennyorder://') === 0 ||
    back.indexOf('jenny://') === 0 ||              // 로그아웃 방지 추가
    back.indexOf('order-app://') === 0 || // app.json에 설정한 scheme 명 입력
    back.indexOf('https://') === 0 ||             //08.05 추가 웹 환경에서 앱으로 가기 버튼
    back.indexOf('http://localhost') === 0 ||
    /^https:\/\/[a-z0-9.-]+\.(replit\.dev|repl\.co)(\/|$)/.test(back);
  if (!okBack) back = '';

  var props = PropertiesService.getScriptProperties();
  var clientId = props.getProperty('OAUTH_CLIENT_ID');
  var clientSecret = props.getProperty('OAUTH_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return loginPage_('설정 오류', '스크립트 속성에 OAUTH_CLIENT_ID / OAUTH_CLIENT_SECRET을 넣어주세요.', '');
  }

  var resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      code: e.parameter.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: ScriptApp.getService().getUrl(),
      grant_type: 'authorization_code',
    },
    muteHttpExceptions: true,
  });
  var tok = JSON.parse(resp.getContentText());
  if (!tok.id_token) {
    return loginPage_('FAILED TO LOG IN', 'Google authentication failed. PLEASE TRY AGAIN.', '');
  }
  var payload = JSON.parse(
    Utilities.newBlob(Utilities.base64DecodeWebSafe(tok.id_token.split('.')[1])).getDataAsString(),
  );
  var email = String(payload.email || '').trim().toLowerCase();

  var user = getUsers_().filter(function (u) { return u.email === email; })[0];
  if (!user) {
    return loginPage_('Access Denied', email + ' is not a registered user.\nContact App administrator.', '');
  }
  var role = user.role; // 시트 LEVEL 그대로 전달 (master / administrator / user)
  // hand back only a one-time code; the app exchanges it via ?action=authresult
  var oneTime = Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put(
    'auth_' + oneTime,
    JSON.stringify({ email: email, role: role, n: nonce }),
    300, // 5 minutes
  );
  var link = back ? back + '#code=' + oneTime : '';
  return loginPage_('Login Successful', 'Welcome Back ' + email, link);
}

function loginPage_(title, msg, link) {
  var html =
    '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{font-family:sans-serif;background:#12294b;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}' +
    '.card{background:#fff;color:#222;border-radius:16px;padding:32px 24px;max-width:340px;text-align:center}' +
    'h2{margin:0 0 12px}p{white-space:pre-line;font-size:14px;color:#555}' +
    'a{display:inline-block;margin-top:16px;background:#0d9488;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:bold}</style>' +
    '</head><body><div class="card"><h2>' + title + '</h2><p>' + msg + '</p>' +
    (link ? '<a href="' + link + '" target="_top">OPEN APP</a>' : '') +
    '</div></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ============================ USERS ============================== */

function usersSheet_() {
  var sh = SS.getSheetByName('USERS') || SS.getSheetByName('USER');
  if (!sh) {
    sh = SS.insertSheet('USERS');
    sh.appendRow(['EMAIL', 'ROLE', 'STATUS', 'PIN', 'REQUESTED AT', 'APPROVED AT']);
  }
  return sh;
}

function getUsers_() {
  var rows = usersSheet_().getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var email = String(rows[i][0] || '').trim().toLowerCase();
    if (!email) continue;
    out.push({
      email: email,
      role: String(rows[i][1] || 'staff').trim().toLowerCase(),
      status: String(rows[i][2] || 'pending').trim().toLowerCase(),
      pin: String(rows[i][3] || ''),
    });
  }
  return out;
}

function getUserRole_(email) {
  var users = getUsers_();
  for (var i = 0; i < users.length; i++) {
    if (users[i].email === email) return users[i].role; // 소문자로 정규화됨
  }
  return '';
}

function findUserRow_(email) {
  var sh = usersSheet_();
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim().toLowerCase() === email) return i + 1; // 1-based
  }
  return -1;
}

function requestAccess_(body) {
  var email = String(body.email || '').trim().toLowerCase();
  if (!email) return { ok: false, error: 'email required' };
  var sh = usersSheet_();
  if (findUserRow_(email) === -1) {
    sh.appendRow([email, 'staff', 'pending', '', new Date(), '']);
  }
  return { ok: true };
}

function approveUser_(body) {
  var email = String(body.email || '').trim().toLowerCase();
  var pin = String(body.pin || '');
  if (!email || !pin) return { ok: false, error: 'email and pin required' };
  var sh = usersSheet_();
  var row = findUserRow_(email);
  if (row === -1) {
    sh.appendRow([email, 'staff', 'pending', pin, new Date(), new Date()]);
  } else {
    sh.getRange(row, 4).setValue(pin);
    sh.getRange(row, 6).setValue(new Date());
  }
  return { ok: true };
}

function activateUser_(body) {
  var email = String(body.email || '').trim().toLowerCase();
  var row = findUserRow_(email);
  if (row !== -1) {
    var sh = usersSheet_();
    sh.getRange(row, 3).setValue('active');
    sh.getRange(row, 4).setValue(''); // clear used PIN
  }
  return { ok: true };
}



//추가
function deleteUser_(body) {
  var email = String(body.email || '').trim().toLowerCase();
  if (!email) return { ok: false, error: 'email required' };
  
  var sh = usersSheet_();
  var rows = sh.getDataRange().getValues();
  var rowIndex = -1;
  
  for (var i = 1; i < rows.length; i++) {
    var sheetEmail = String(rows[i][0] || '').trim().toLowerCase();
    if (sheetEmail === email) {
      rowIndex = i + 1; // 1-based row index
      break;
    }
  }
  
  if (rowIndex === -1) return { ok: false, error: 'user not found' };
  
  // 행 전체 삭제 대신 내용 지우기 적용
  sh.getRange(rowIndex, 1, 1, sh.getLastColumn()).clearContent();
  return { ok: true };
}

/* ============================= DATA ============================== */

function getData_(scope, vendor) {
  var epoch = PropertiesService.getScriptProperties().getProperty('SESSION_EPOCH') || '';
  var vendorName = String(vendor || '').trim();
  
  // APPEARANCE 탭의 D1 셀에서 앱 버전을 직접 읽어옴
  var appearanceSheet = SS.getSheetByName('APPEARANCE');
  var appBuildKey = appearanceSheet ? String(appearanceSheet.getRange('G1').getValue() || '').trim() : '';

  if (vendorName) {
    // 벤더 단건: 그 벤더 상품만 내려줌 (앱의 '벤더 선택 시 동기화' 모드)
    return { products: getProducts_(vendorName), sessionEpoch: epoch, appBuildKey: appBuildKey };
  }
  var out = {
    stores: getStores_(),
    vendors: getVendors_(),
    emailTemplate: getEmailTemplate_(),
    appearance: getAppearance_(),
    sessionEpoch: epoch,
    appBuildKey: appBuildKey,
  };
  // scope=light: 상품 제외 (벤더 선택 시 동기화 모드의 시작 동기화)
  if (String(scope || '') !== 'light') out.products = getProducts_();
  return out;
}

/* ========================= APPEARANCE ============================ */
// APPEARANCE 탭: A열=키, B열=값 (앱 화면 커스텀 설정)
function getAppearance_() {
  var sh = SS.getSheetByName('APPEARANCE');
  if (!sh) return null; // 탭 없음 = 아직 관리 안 함 (빈 {}와 구분)
  var rows = sh.getDataRange().getValues();
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    var k = String(rows[i][0] || '').trim();
    if (!k || k.toUpperCase() === 'PARAMETER') continue; // 제목 행 건너뜀
    map[k] = String(rows[i][1] == null ? '' : rows[i][1]);
  }
  return map;
}

function saveAppearance_(body) {
  var map = body.appearance || {};
  var sh = SS.getSheetByName('APPEARANCE') || SS.insertSheet('APPEARANCE');
  sh.getRange('A:B').clearContent();
  sh.getRange(1, 1, 1, 2).setValues([['PARAMETER', 'VALUE']]); // 제목 행 유지
  var keys = Object.keys(map);
  if (keys.length) {
    var rows = keys.map(function (k) { return [k, map[k]]; });
    sh.getRange(2, 1, rows.length, 2).setValues(rows); // 데이터는 2행부터
  }
  return { ok: true, saved: keys.length };
}

function getStores_() {
  var sh = SS.getSheetByName('STORE');
  if (!sh) return [];
  var rows = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var name = String(rows[i][0] || '').trim();
    if (!name) continue;
    var addr = [String(rows[i][1] || '').trim(), String(rows[i][2] || '').trim()]
      .filter(String).join(', ');
    out.push({ name: name, address: addr });
  }
  return out;
}

function getVendors_() {
  var sh = SS.getSheetByName('VENDOR');
  if (!sh) return [];
  var rows = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var name = String(rows[i][0] || '').trim();
    if (!name) continue;
    out.push({
      name: name,
      salesPerson: String(rows[i][1] || ''),
      email: String(rows[i][2] || ''),
      qtyStep: Math.max(1, Math.floor(Number(rows[i][8]) || 1)), // I열: +/- 수량 단위
      map: {
        upcCol: String(rows[i][3] || '').trim().toUpperCase(),
        codeCol: String(rows[i][4] || '').trim().toUpperCase(),
        descCol: String(rows[i][5] || '').trim().toUpperCase(),
        costCol: String(rows[i][6] || '').trim().toUpperCase(),
        imageCol: String(rows[i][7] || '').trim().toUpperCase() || undefined,
      },
    });
  }
  return out;
}

function colIndex_(letter) {
  if (!letter) return -1;
  var n = 0;
  for (var i = 0; i < letter.length; i++) n = n * 26 + (letter.charCodeAt(i) - 64);
  return n - 1; // 0-based
}

function getProducts_(onlyVendor) {
  var vendors = getVendors_();
  if (onlyVendor) {
    var want = String(onlyVendor).trim().toUpperCase();
    vendors = vendors.filter(function (v) { return v.name.toUpperCase() === want; });
  }
  var out = [];
  vendors.forEach(function (v) {
    var sh = SS.getSheetByName(v.name);
    if (!sh) return; // no price tab for this vendor
    var m = v.map;
    var iUpc = colIndex_(m.upcCol), iCode = colIndex_(m.codeCol),
        iDesc = colIndex_(m.descCol), iCost = colIndex_(m.costCol),
        iImg = m.imageCol ? colIndex_(m.imageCol) : -1;
    if (iUpc < 0) return;
    var rows = sh.getDataRange().getValues();
    for (var r = 0; r < rows.length; r++) {
      var upc = String(rows[r][iUpc] || '').replace(/[^0-9]/g, '');
      if (!/^\d{6,14}$/.test(upc)) continue; // skips headers/brand rows
      var cost = iCost >= 0 ? parseFloat(String(rows[r][iCost]).replace(/[$,\s]/g, '')) : 0;
      out.push({
        upc: upc,
        itemCode: String(iCode >= 0 ? rows[r][iCode] : '').trim(),
        description: String(iDesc >= 0 ? rows[r][iDesc] : '').trim(),
        cost: isNaN(cost) ? 0 : cost,
        vendor: v.name,
        imageUrl: iImg >= 0 ? String(rows[r][iImg] || '').trim() : '',
      });
    }
  });
  return out;
}

function getEmailTemplate_() {
  var sh = SS.getSheetByName('EMAIL');
  if (!sh) return null;
  return {
    title: String(sh.getRange('B1').getValue() || ''),
    body: String(sh.getRange('B2').getValue() || ''),
  };
}

/* ============================ ORDERS ============================= */

var TIMEZONE = 'America/Chicago';
var BYPASS_EMAIL = true;

var DEPT_CONFIG = {
  'GM': {
    folderId: '1zumfLOoj2BQ41djL5JWlsPRKXIQ1IcrP',
    orderFileId: '1rz9N-B3thjepiWJaXyAZC7ekxCNSPr6qDEUxINbSEgE',
    exportFileId: '1bZpSO5BFvdKBTc1u9vrK7SlulyagzXFKnmkf3XwwUdM'
  },
  'PRODUCT': {
    folderId: '0AD5atSBCNOrfUk9PVA',
    orderFileId: '1rxje0biYpJESDuo_X7R9lDLKfeWx42y_P6dj_ubIC7w',
    exportFileId: '1FqeMQ3ygjcr8S_gadDw4_UtLxo21ETBfwgLsNSqHxkU'
  }
};

// SEND 흐름: 탭 기록 → PDF 생성 → 벤더 이메일 발송 → 백업 탭 저장 → 원본 초기화
function recordOrder_(body) {
  var startTime = Date.now(); // 1. 스크립트 시작 시간 기록

  var email = String(body.user || '').trim();
  if (!email) return { ok: false, error: 'no user email' };

  // 동시 SEND 방지: 다른 주문이 처리 중이면 기다리지 않고 즉시 안내 메시지 반환
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) {
    return { ok: false, busy: true, error: 'Server is processing another order. Please try again shortly.' };
  }
  try {
    return recordOrderLocked_(body, email, startTime); // startTime 전달 추가
  } finally {
    lock.releaseLock();
  }
}

function recordOrderLocked_(body, email, startTime) { // startTime 파라미터 추가
  var sh = SS.getSheetByName(email);
  if (!sh) {
    var tpl = SS.getSheetByName('TEMPLATE');
    if (!tpl) return { ok: false, error: 'TEMPLATE tab not found' };
    sh = tpl.copyTo(SS).setName(email);
  }

  // 숨겨진 탭은 PDF export가 실패하므로 잠시 표시했다가 끝나면 다시 숨김
  // SENDING 깃발: 이 동안 hideOtherSheets()가 숨기기를 건너뛰게 함
  var wasHidden = sh.isSheetHidden();
  var cache = CacheService.getScriptCache();
  cache.put('SENDING', '1', 180); // 최대 3분
  if (wasHidden) sh.showSheet();
  try {
    return recordOrderInner_(sh, body, startTime); // startTime 전달 추가
  } finally {
    if (wasHidden) sh.hideSheet();
    cache.remove('SENDING');
  }
}

function recordOrderInner_(sh, body, startTime) { // startTime 파라미터

  // B1(부서 이미지)도 초기화 대상에 포함하여 작업 탭을 깔끔하게 정리 (E6 추가)
  sh.getRangeList(['B1', 'B4', 'D4', 'E6', 'G1', 'G2', 'G3', 'G5', 'B10:F5000']).clearContent();

  // 1) 부서별 로고 이미지를 B1 셀에 수식으로 삽입 (PDF 생성 및 템플릿 작업용)
  var deptKey = String(body.department || 'PRODUCT').trim().toUpperCase();
  var imageId = (deptKey === 'GM') 
    ? '13kuGkgRIpVja2DKvx8gF4UOsL2EEIEWT' 
    : '1YLTWSPjZfqURaPdLmexaOsSDmos5P9Ad';
  sh.getRange('B1').setFormula('=IMAGE("https://drive.google.com/uc?id=' + imageId + '")');

  // 2) 나머지 주문 정보 입력
  sh.getRange('B4').setValue(body.store || '');
  sh.getRange('D4').setValue(body.shipToJBS ? 'JBS' : (body.store || ''));
  sh.getRange('E6').setValue(body.me2ve || ''); // me2ve 메시지 기록
  sh.getRange('G1').setValue(body.vendor || '');
  sh.getRange('G2').setValue(new Date());
  sh.getRange('G3').setValue(String(body.user || '').trim()); // 발주자 이메일 기록
  sh.getRange('G5').setValue(body.jorderid ? 'ORDER ID : ' + body.jorderid : ''); // ORDER ID 기록

  var items = body.items || [];
  if (items.length) {
    var rows = items.map(function (it) {
      return [
        "'" + (it.upc || ''),
        it.itemCode || '',
        it.description || '',
        it.cost || 0,
        it.qty || 0,
      ];
    });
    sh.getRange(9, 2, rows.length, 5).setValues(rows); // B9:F부터
  }
  SpreadsheetApp.flush(); // 수식 계산 및 이미지 렌더링 반영 대기

  // 파일명: 벤더명 mm.dd.yyyy 매장 시:분
  var stamp = Utilities.formatDate(new Date(), TIMEZONE, 'MM.dd.yyyy') + ' ' +
              (body.store || '') + ' ' +
              Utilities.formatDate(new Date(), TIMEZONE, 'HH:mm');
  var fileName = (body.vendor || 'ORDER') + ' ' + stamp;

  // 2.5) PDF 생성 — 실패 시 어느 단계인지 표시 (이제 B1 이미지가 포함되어 캡처됨)
  var pdf;
  try {
    pdf = exportTabPdf_(sh, fileName); 
  } catch (exportErr) {
    throw new Error('[EXPORT] ' + exportErr);
  }

  // 3) 부서(department)별 지정 폴더 하위 당일 날짜 폴더에 PDF 저장 (3단계 이메일 발송 전)// 3) 부서(department)별 지정 폴더 하위 당일 날짜 폴더에 PDF 저장 (3단계 이메일 발송 전)
  var savedPdfUrl = '';
  try {
    var savedFile = saveFilesToUserFolder_(pdf, body.department);
    savedPdfUrl = savedFile.getUrl();
  } catch (saveErr) {
    throw new Error('[FILE_SAVE] ' + saveErr);
  }

  // 3.5) 외부 시트에 주문 내역 로깅 (월별 탭, A3 이후 빈 행)
  try {
    logOrderToExternalSheet_(body, savedPdfUrl);
  } catch (logErr) {
    throw new Error('[EXTERNAL_LOG] ' + logErr);
  }

  // 4) 벤더 이메일 발송 (제목 = EMAIL 탭 B1, 본문 = EMAIL 탭 B2)
  var emailSh = SS.getSheetByName('EMAIL');
  var subject = emailSh ? String(emailSh.getRange('B1').getValue() || 'Purchase Order') : 'Purchase Order';
  var bodyText = emailSh ? String(emailSh.getRange('B2').getValue() || '') : '';
  // 이메일이 실패해도 아카이브는 진행하고, 결과를 앱에 알려줌
  var emailed = false, emailNote = '';

  if (typeof BYPASS_EMAIL !== 'undefined' && BYPASS_EMAIL) {
    emailNote = 'Order has been sent to Google Drive';
  } else if (body.vendorEmail) {
    try {
      var opts = { attachments: [pdf] };
      // MASTER / ADMINISTRATOR 등급은 본인 메일로도 사본 수신
      var senderEmail = String(body.user || '').trim().toLowerCase();
      var senderRole = getUserRole_(senderEmail);
      if (senderRole.indexOf('admin') === 0 || senderRole === 'master') opts.cc = senderEmail;
      MailApp.sendEmail(body.vendorEmail, subject, bodyText, opts);
      emailed = true;
    } catch (mailErr) {
      emailNote = String(mailErr);
    }
  } else {
    emailNote = 'vendor email missing in order data';
  }

  // 5) Order Backup 스프레드시트에 값+서식 사본 탭 추가 — 실패 시 어느 단계인지 표시
  try {
    backupOrderTab_(sh, fileName, body.department);
  } catch (bkErr) {
    throw new Error('[BACKUP] ' + bkErr);
  }

  // 6) 원본 초기화 (B1 포함하여 잔상 제거)
  sh.getRangeList(['B1', 'B4', 'D4', 'G1', 'G2', 'G3', 'G5', 'B9:F5000']).clearContent();

  // 7) 경과 시간 계산 및 emailNote 업데이트 추가
  var endTime = Date.now();
  var elapsedSec = ((endTime - startTime) / 1000).toFixed(2);
  
  if (emailNote !== '') {
    emailNote = emailNote + ' ' + elapsedSec;
  } else {
    emailNote = String(elapsedSec);
  }

  return { ok: true, recorded: items.length, file: fileName, emailed: emailed, emailNote: emailNote };
}

// 부서(department)별 지정 폴더 하위에 당일 날짜(MM.dd.yyyy) 폴더를 생성/탐색하여 PDF 파일 저장
function saveFilesToUserFolder_(pdf, department) {
  var deptKey = String(department || 'PRODUCT').trim().toUpperCase();
  var config = DEPT_CONFIG[deptKey] || DEPT_CONFIG['PRODUCT'];
  var targetFolderId = config.folderId;
  
  var folder = DriveApp.getFolderById(targetFolderId);
  
  // 날짜 하위 폴더 이름 생성 (MM.dd.yyyy)
  var dateFolderName = Utilities.formatDate(new Date(), TIMEZONE, 'MM.dd.yyyy');
  var subFolders = folder.getFoldersByName(dateFolderName);
  var targetSubFolder;
  
  // 하위 폴더가 존재하면 가져오고 없으면 새로 생성
  if (subFolders.hasNext()) {
    targetSubFolder = subFolders.next();
  } else {
    targetSubFolder = folder.createFolder(dateFolderName);
  }
  
  // 생성/지정된 날짜 폴더 안에 pdf 파일 저장하고 파일 객체 반환
  return targetSubFolder.createFile(pdf);
}

// 탭의 B1:G(마지막 행)을 PDF Blob   실제 저장 함수
function exportTabPdf_(sh, fileName) {
  // B열(UPC) 기준 실제 데이터 마지막 행 — G열 ARRAYFORMULA 출력 때문에 getLastRow()는 수천 행이 나옴
  var colB = sh.getRange(1, 2, sh.getLastRow(), 1).getValues();
  var lastRow = 9;
  for (var i = colB.length - 1; i >= 0; i--) {
    if (String(colB[i][0] || '').length) { lastRow = i + 1; break; }
  }
  // 범위 파라미터(r1/r2)를 쓰면 fzr(고정 행 반복)이 무시됨 —
  // 대신 필요 없는 행/열을 잠시 숨기고 시트 전체를 내보낸다.
  // 1~8행 반복은 시트에서 [보기 > 고정 > 8행까지] 고정해야 동작.
  var maxRows = sh.getMaxRows(), maxCols = sh.getMaxColumns();
  var hideRowCount = maxRows - lastRow;   // lastRow 아래
  var hideColCount = maxCols - 7;         // H열부터 (B1:G 범위 유지)
  // 고정(freeze)된 열은 숨길 수 없음 — 고정 열이 있으면 A열 숨기기는 건너뜀
  var hideColA = sh.getFrozenColumns() < 1;
  if (hideRowCount > 0) sh.hideRows(lastRow + 1, hideRowCount);
  if (hideColA) sh.hideColumns(1); // A열
  if (hideColCount > 0) sh.hideColumns(8, hideColCount);
  SpreadsheetApp.flush();
  var url = 'https://docs.google.com/spreadsheets/d/' + SS.getId() + '/export' +
    '?format=pdf&gid=' + sh.getSheetId() +
    '&size=letter&portrait=true&fitw=true&fzr=true' +
    '&gridlines=false&sheetnames=false&printtitle=false&pagenum=false';
  try {
    var res = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    });
    return res.getBlob().setName(fileName + '.pdf');
  } finally {
    // 내보내기 후 원상복구
    if (hideRowCount > 0) sh.showRows(lastRow + 1, hideRowCount);
    if (hideColA) sh.showColumns(1);
    if (hideColCount > 0) sh.showColumns(8, hideColCount);
  }
}

function backupOrderTab_(sh, tabName, department) {
  var deptKey = String(department || 'PRODUCT').trim().toUpperCase();
  var config = DEPT_CONFIG[deptKey] || DEPT_CONFIG['PRODUCT'];

  // 부서별 이미지 ID 설정
  var imageId = (deptKey === 'GM') 
    ? '13kuGkgRIpVja2DKvx8gF4UOsL2EEIEWT' 
    : '1YLTWSPjZfqURaPdLmexaOsSDmos5P9Ad';
  var imageUrl = 'https://drive.google.com/uc?id=' + imageId;

  var backupSS = SpreadsheetApp.openById(config.orderFileId);
  
  var copied = sh.copyTo(backupSS).setName(tabName.slice(0, 100));

  // 실제 데이터가 있는 마지막 행 찾기 (B열 기준, 최소 9행) — 수천 행 전체 복사 방지
  var colB = sh.getRange(1, 2, sh.getLastRow(), 1).getValues();
  var lastRow = 9;
  for (var i = colB.length - 1; i >= 0; i--) {
    if (String(colB[i][0] || '').length) { lastRow = i + 1; break; }
  }
  var numCols = sh.getLastColumn();

  // 원본에서 계산 완료된 값을 덮어쓰기 (타 파일 복사 시 수식이 #REF!로 깨지는 것 방지)
  // 셀 안 이미지(CellImage 등) 값은 setValues가 못 써서 에러가 나므로 비워서 처리
  var vals = sh.getRange(1, 1, lastRow, numCols).getValues().map(function (row) {
    return row.map(function (v) {
      return (v !== null && typeof v === 'object' && !(v instanceof Date)) ? '' : v;
    });
  });
  copied.getRange(1, 1, lastRow, numCols).setValues(vals);

  copied.getRange("B1").setFormula('=IMAGE("' + imageUrl + '")');

  copied.getRange("G4").setFormula('=IFERROR(GET_FULL_URL(),"")');
  
  copied.getRange("E5").setFormula('IF(G1="7 DOLLAR","메시지 아래 입력","")');

  // 데이터 아래 남은 깨진 수식(#REF!) 정리
  var maxR = copied.getMaxRows();
  if (maxR > lastRow) copied.getRange(lastRow + 1, 1, maxR - lastRow, numCols).clearContent();

  var vendorVal = String(sh.getRange('G1').getValue() || '').trim().toUpperCase();
  if (vendorVal === '7 DOLLAR') {
    try {
      var fileObj = DriveApp.getFileById(config.orderFileId);
      var parentFolders = fileObj.getParents();
      if (parentFolders.hasNext()) {
        var folder = parentFolders.next();
        var g4Val = String(sh.getRange('G4').getValue() || '');
        folder.createFile(tabName + '.txt', g4Val, MimeType.PLAIN_TEXT);
      }
    } catch (txtErr) {
      console.error('Failed to create 7 DOLLAR text file: ' + txtErr);
    }
  }
}

// 외부 스프레드시트 월별 탭에 발주 내역 기록
function logOrderToExternalSheet_(body, pdfUrl, department) {
  var deptKey = String(department || body.department || 'PRODUCT').trim().toUpperCase();
  
  // 부서별 외부 시트 ID 설정 (PRODUCT 시트 생성 후 아래 PRODUCT 주소만 교체)
  var sheetIds = {
    'GM': '1h9W5COqxs56N8gkqEBvuupHPHZ0Hf43-Hihrwg1b9Fw',
    'PRODUCT': '1h9W5COqxs56N8gkqEBvuupHPHZ0Hf43-Hihrwg1b9Fw'
  };
  var logSheetId = sheetIds[deptKey] || sheetIds['PRODUCT'];
  
  var ss = SpreadsheetApp.openById(logSheetId);
  
  var now = new Date();
  var monthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
  var monthTabName = monthNames[now.getMonth()];
  
  var sh = ss.getSheetByName(monthTabName);
  if (!sh) return; // 해당 월의 탭이 없으면 에러 없이 패스
  
  var formattedDate = Utilities.formatDate(now, TIMEZONE, 'MM/dd/yyyy');
  var store = body.store || '';
  var vendor = body.vendor || '';
  var jorderid = body.jorderid || '';
  var total = body.total || 0;
  
  // A3 이후 첫 빈 행 찾기 (A열 데이터 기준)
  var targetRow = 3;
  var lastRow = sh.getLastRow();
  if (lastRow >= 3) {
    var aValues = sh.getRange(3, 1, lastRow - 2, 1).getValues();
    for (var i = 0; i < aValues.length; i++) {
      if (String(aValues[i][0]).trim() !== '') {
        targetRow = i + 4; // 0-index 기준(i)에서 실제 행 번호 계산
      }
    }
  }
  
  // E열: PDF 링크가 있고 order ID도 있으면 하이퍼링크 수식 적용, 아니면 일반 텍스트
  var orderIdVal = '';
  if (jorderid) {
    orderIdVal = pdfUrl ? '=HYPERLINK("' + pdfUrl + '", "' + jorderid + '")' : jorderid;
  }
  
  // A, B, C, D, E, F, G, H 열에 맞게 배열 구성
  var rowData = [[
    formattedDate, 
    store, 
    '', 
    vendor, 
    orderIdVal, 
    '', 
    '', 
    total
  ]];
  
  // 찾은 빈 행에 한 번에 값 쓰기 (수식은 자동으로 텍스트 수식으로 파싱됨)
  sh.getRange(targetRow, 1, 1, 8).setValues(rowData);
}

/* ============================ EXPORT ============================= */

// EXPORT 흐름: 탭 기록 → 백업 탭 저장 → 원본 초기화
function recordExport_(body) {
  
  var email = String(body.user || '').trim();
  if (!email) return { ok: false, error: 'no user email' };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) {
    return { ok: false, busy: true, error: 'Server is processing another export. Please try again shortly.' };
  }

  try {
    return recordExportLocked_(body, email);
  } finally {
    lock.releaseLock();
  }
}

function recordExportLocked_(body, email) {
  var sh = SS.getSheetByName(email);
  if (!sh) {
    var tpl = SS.getSheetByName('TEMPLATE');
    if (!tpl) return { ok: false, error: 'TEMPLATE tab not found' };
    sh = tpl.copyTo(SS).setName(email);
  }

  var wasHidden = sh.isSheetHidden();
  var cache = CacheService.getScriptCache();
  cache.put('EXPORTING', '1', 180);

  if (wasHidden) sh.showSheet();

  try {
    return recordExportInner_(sh, body);
  } finally {
    if (wasHidden) sh.hideSheet();
    cache.remove('EXPORTING');
  }
}

function recordExportInner_(sh, body) {

  sh.getRangeList(['B4', 'D4', 'G1', 'G2', 'G3', 'B9:F5000']).clearContent();

  sh.getRange('B4').setValue(body.store || '');
  sh.getRange('D4').setValue(body.shipToJBS ? 'JBS' : (body.store || ''));
  sh.getRange('G1').setValue(body.vendor || '');
  sh.getRange('G2').setValue(new Date());
  sh.getRange('G3').setValue(String(body.user || '').trim()); // 발주자 이메일 기록

  var tpl2 = SS.getSheetByName('TEMPLATE 2');
  if (tpl2) tpl2.getRange('K3').setValue(String(body.user || '').trim());

  var items = body.items || [];
  if (items.length) {
    var rows = items.map(function (it) {
      return [
        "'" + (it.upc || ''),
        it.itemCode || '',
        it.description || '',
        it.cost || 0,
        it.qty || 0,
      ];
    });
    sh.getRange(9, 2, rows.length, 5).setValues(rows);
  }

  SpreadsheetApp.flush();

  var timezone = Session.getScriptTimeZone();

  var stamp = Utilities.formatDate(new Date(), timezone, 'MM.dd.yyyy') + ' ' +
            (body.store || '') + ' ' +
            Utilities.formatDate(new Date(), timezone, 'HH:mm');

  var tabName = (body.vendor || 'EXPORT') + ' ' + stamp;

  try {
    backupExportTab_(sh, tabName, body.department);
  } catch (err) {
    throw new Error('[EXPORT BACKUP] ' + err);
  }

  sh.getRangeList(['B4', 'D4', 'G1', 'G2', 'G3', 'B9:F5000']).clearContent();

  return {
    ok: true,
    recorded: items.length,
    file: tabName
  };
}

// Export Backup 파일에 탭 복사
function backupExportTab_(sh, tabName, department) {

  var deptKey = String(department || 'PRODUCT').trim().toUpperCase();
  var config = DEPT_CONFIG[deptKey] || DEPT_CONFIG['PRODUCT'];
  var backupSS = SpreadsheetApp.openById(config.exportFileId);

  // 부서별 이미지 ID 설정
  var imageId = (deptKey === 'GM') 
    ? '13kuGkgRIpVja2DKvx8gF4UOsL2EEIEWT' 
    : '1YLTWSPjZfqURaPdLmexaOsSDmos5P9Ad';
  var imageUrl = 'https://drive.google.com/uc?id=' + imageId;

  var copied = sh.copyTo(backupSS).setName(tabName.slice(0, 100));

  var colB = sh.getRange(1, 2, sh.getLastRow(), 1).getValues();
  var lastRow = 9;

  for (var i = colB.length - 1; i >= 0; i--) {
    if (String(colB[i][0] || '').length) {
      lastRow = i + 1;
      break;
    }
  }

  var numCols = sh.getLastColumn();

  var vals = sh.getRange(1, 1, lastRow, numCols).getValues().map(function (row) {
    return row.map(function (v) {
      return (v !== null && typeof v === 'object' && !(v instanceof Date)) ? '' : v;
    });
  });

  copied.getRange(1, 1, lastRow, numCols).setValues(vals);

  //이미지 박제
  copied.getRange("B1").setFormula('=IMAGE("' + imageUrl + '")');
  
  var maxR = copied.getMaxRows();

  if (maxR > lastRow) {
    copied.getRange(lastRow + 1, 1, maxR - lastRow, numCols).clearContent();
  }
}

/* ============================ UTIL =============================== */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ========================= IMPORT / GET TABS ========================= */

// 부서(department)에 맞춰 다이렉트로 백업 파일을 여는 함수
function getExportBackupFile_(department) {
  var deptKey = String(department || 'PRODUCT').trim().toUpperCase();
  var config = DEPT_CONFIG[deptKey] || DEPT_CONFIG['PRODUCT'];
  
  try {
    return SpreadsheetApp.openById(config.exportFileId);
  } catch(e) {
    return null;
  }
}

// getTabs 로직 (관리자 전체 조회 / 일반 사용자 D3 셀 이메일 매칭)
function handleGetTabs_(body) {
  var email = String(body.userEmail || '').trim().toLowerCase();
  if (!email) return { ok: false, error: 'User email is required' };
  
  var backupSS = getExportBackupFile_(body.department);
  if (!backupSS) return { ok: true, tabs: [] }; // 백업 파일이 아직 없으면 빈 목록

  // 관리자 이메일 목록
  var ADMIN_EMAILS = ['samhong@jennybs.com', 'joonlim@jennybs.com'];
  var isAdmin = ADMIN_EMAILS.indexOf(email) !== -1;

  var sheets = backupSS.getSheets();
  var tabs = [];
  
  // 최신 데이터가 맨 위에 오도록 역순으로 가져오기
  for (var i = sheets.length - 1; i >= 0; i--) {
    var sh = sheets[i];
    var name = sh.getName();
    
    // 기본 빈 시트('Sheet'로 시작하는 시트)는 제외
    if (name.indexOf('Sheet') !== 0) {
      if (isAdmin) {
        // 관리자는 해당 파일 내의 모든 발주서 탭을 볼 수 있음
        tabs.push(name);
      } else {
        // 일반 사용자는 G3 셀의 이메일과 로그인 이메일이 일치할 때만 목록에 추가
        var d3Email = String(sh.getRange("G3").getValue() || '').trim().toLowerCase();
        if (d3Email === email) {
          tabs.push(name);
        }
      }
    }
  }
  return { ok: true, tabs: tabs };
}

// import 로직 (추출 후 탭 자동 삭제)
function handleImport_(body) {
  var email = String(body.userEmail || '').trim().toLowerCase();
  var tabName = body.tabName;
  
  if (!email) return { ok: false, error: 'User email is required' };
  if (!tabName) return { ok: false, error: 'Tab name is required' };
  
  var backupSS = getExportBackupFile_(body.department);
  if (!backupSS) return { ok: false, error: 'Backup file not found' };
  
  var sh = backupSS.getSheetByName(tabName);
  if (!sh) return { ok: false, error: 'Tab not found: ' + tabName };
  
  // 데이터 파싱 (요청하신 B4, D4, G1 좌표 기준)
  var storeName = String(sh.getRange("B4").getValue() || '').trim();
  var d4Value = String(sh.getRange("D4").getValue() || '').trim().toUpperCase();
  var vendorName = String(sh.getRange("G1").getValue() || '').trim();
  
  var shipToJBS = d4Value.indexOf('JBS') !== -1; // JBS 글자가 있으면 true
  
  var lastRow = sh.getLastRow();
  var items = [];
  
  // 4-2. 아이템 리스트 추출 (9행부터 B열:UPC, C열:Item Code, F열:QTY)
  if (lastRow >= 9) {
    // 2열(B)부터 5칸 넓이(F)까지 데이터를 2차원 배열로 한 번에 로드
    var values = sh.getRange(9, 2, lastRow - 8, 5).getValues();
    
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var upc = String(row[0] || '').trim().replace(/^'/, ''); // B열 (인덱스 0)
      var optionStr = String(row[1] || '');                     // C열 (인덱스 1)
      var qty = Number(row[4]);                                 // F열 (인덱스 4)
      
      // 값이 존재하는 유효한 수량만 처리
      if (upc !== "" && !isNaN(qty) && qty > 0) {
        var opt = undefined;
        
        // C열 텍스트에 '/'가 있으면 오른쪽 부분만 추출해서 trim()
        var parts = optionStr.split('/');
        if (parts.length > 1) {
          opt = parts[1].trim();
        }
        
        items.push({ upc: upc, qty: qty, opt: opt });
      }
    }
  }
  
  //앱으로 데이터를 안전하게 전송하기 위해 이 단계에서는 탭을 삭제하지 않습니다.
  
  return {
    ok: true,
    store: storeName,
    vendor: vendorName,
    shipToJBS: shipToJBS,
    items: items
  };
}

// 2-Step 삭제 신호를 앱으로부터 성공적으로 받았을 때 실행되는 탭 삭제 함수
function handleDeleteTab_(body) {
  var tabName = body.tabName;
  if (!tabName) return { ok: false, error: 'Tab name is required' };
  
  var backupSS = getExportBackupFile_(body.department);
  if (!backupSS) return { ok: false, error: 'Backup file not found' };
  
  var sh = backupSS.getSheetByName(tabName);
  if (!sh) return { ok: false, error: 'Tab not found or already deleted' };

  // 시트 파일에는 무조건 1개 이상의 탭이 있어야 에러가 나지 않음
  if (backupSS.getSheets().length <= 1) {
    backupSS.insertSheet('Sheet1');
  }
  backupSS.deleteSheet(sh);
  
  return { ok: true, message: 'Tab safely deleted' };
}