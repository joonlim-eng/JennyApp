// 최종 수정: 2026-08-09 10:44 PM(CT) 배포
var SS = SpreadsheetApp.getActiveSpreadsheet();
/* ====================== Version Verification ====================== */

/* ============================== GET ============================== */

function doGet(e) {
  
  var action = (e && e.parameter && e.parameter.action) || '';
  try {
    // Google 로그인 복귀 (action이 없을 때만 — authresult 등 JSON 요청도 code 파라미터를 쓰므로)
    if (e && e.parameter && e.parameter.code && !action) return handleOAuthRedirect_(e);
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
    var action = body.action || 'order';
    if (action === 'requestAccess') return json_(requestAccess_(body));
    if (action === 'approveUser') return json_(approveUser_(body));
    if (action === 'activateUser') return json_(activateUser_(body));
    if (action === 'saveAppearance') return json_(saveAppearance_(body));
    if (action === 'forceLogout') return json_(forceLogout_());
    if (action === 'deleteUser' || action === 'removeUser') return json_(deleteUser_(body));//08.05추가
    if (action === 'export') return json_(recordExport_(body));  //08.05 export 기능 추가
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
  if (vendorName) {
    // 벤더 단건: 그 벤더 상품만 내려줌 (앱의 '벤더 선택 시 동기화' 모드)
    return { products: getProducts_(vendorName), sessionEpoch: epoch };
  }
  var out = {
    stores: getStores_(),
    vendors: getVendors_(),
    emailTemplate: getEmailTemplate_(),
    appearance: getAppearance_(),
    sessionEpoch: epoch,
  };
  // scope=light: 상품 제외 (벤더 선택 시 동기화 모드의 시작 동기화)
  if (String(scope || '') !== 'light') out.products = getProducts_();
  return out;
}

// 전원 강제 로그아웃: epoch 값을 갱신하면 각 기기가 동기화 때 감지해 로그아웃함
function forceLogout_() {
  var epoch = String(Date.now());
  PropertiesService.getScriptProperties().setProperty('SESSION_EPOCH', epoch);
  return { ok: true, epoch: epoch };
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
  sh.clearContents();
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

var BACKUP_FOLDER_ID = '0AD5atSBCNOrfUk9PVA';  //sam
var BACKUP_FILE_NAME = 'Order Backup';         //sam or rest     
var JLFOLDERID = '1zumfLOoj2BQ41djL5JWlsPRKXIQ1IcrP';  //JOON
var JLFILENAME = 'JOONS ORDER BACKUPS';         //JOON   
var JL_EMAILS = ['joonlim@jennybs.com'];        // 이메일 추가 가능

var TIMEZONE = 'America/Chicago';

// SEND 흐름: 탭 기록 → PDF 생성 → 벤더 이메일 발송 → 백업 탭 저장 → 원본 초기화
function recordOrder_(body) {
  var email = String(body.user || '').trim();
  if (!email) return { ok: false, error: 'no user email' };

  // 동시 SEND 방지: 다른 주문이 처리 중이면 기다리지 않고 즉시 안내 메시지 반환
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) {
    return { ok: false, busy: true, error: 'Server is processing another order. Please try again shortly.' };
  }
  try {
    return recordOrderLocked_(body, email);
  } finally {
    lock.releaseLock();
  }
}

function recordOrderLocked_(body, email) {
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
    return recordOrderInner_(sh, body);
  } finally {
    if (wasHidden) sh.hideSheet();
    cache.remove('SENDING');
  }
}

function recordOrderInner_(sh, body) {

  sh.getRangeList(['B4', 'D4', 'G1', 'G2', 'G3', 'B9:F5000']).clearContent();

  sh.getRange('B4').setValue(body.store || '');
  sh.getRange('D4').setValue(body.shipToJBS ? 'JBS' : (body.store || ''));
  sh.getRange('G1').setValue(body.vendor || '');
  sh.getRange('G2').setValue(new Date());
  sh.getRange('G3').setValue(String(body.user || '').trim()); // 발주자 이메일 기록

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
  SpreadsheetApp.flush(); // 수식 계산 반영

  // 파일명: 벤더명 mm.dd.yyyy 매장 시:분
  var stamp = Utilities.formatDate(new Date(), TIMEZONE, 'MM.dd.yyyy') + ' ' +
              (body.store || '') + ' ' +
              Utilities.formatDate(new Date(), TIMEZONE, 'HH:mm');
  var fileName = (body.vendor || 'ORDER') + ' ' + stamp;

  // 2) B1:G(마지막 행) PDF 생성 — 실패 시 어느 단계인지 표시
  var pdf;
  try {
    pdf = exportTabPdf_(sh, fileName);
  } catch (pdfErr) {
    throw new Error('[PDF] ' + pdfErr);
  }

  // 3) 벤더 이메일 발송 (제목 = EMAIL 탭 B1, 본문 = EMAIL 탭 B2)
  var emailSh = SS.getSheetByName('EMAIL');
  var subject = emailSh ? String(emailSh.getRange('B1').getValue() || 'Purchase Order') : 'Purchase Order';
  var bodyText = emailSh ? String(emailSh.getRange('B2').getValue() || '') : '';
  // 이메일이 실패해도 아카이브는 진행하고, 결과를 앱에 알려줌
  var emailed = false, emailNote = '';
  if (body.vendorEmail) {
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

  // 4) Order Backup 스프레드시트에 값+서식 사본 탭 추가 — 실패 시 어느 단계인지 표시
  try {
    backupOrderTab_(sh, fileName);
  } catch (bkErr) {
    throw new Error('[BACKUP] ' + bkErr);
  }

  // 5) 원본 초기화
  sh.getRangeList(['B4', 'D4', 'G1', 'G2', 'G3', 'B9:F5000']).clearContent();

  return { ok: true, recorded: items.length, file: fileName, emailed: emailed, emailNote: emailNote };
}

// 탭의 B1:G(마지막 행)을 PDF Blob으로
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

// Order Backup 파일에 탭 복사 (값+서식, 수식은 값으로 고정)
function backupOrderTab_(sh, tabName) {

  
  //이미지 주소 받기 08.05
  var userId = sh.getRange("G3").getValue();

  var users = sh.getParent()
  .getSheetByName("USERS")
  .getRange("A:C")
  .getValues();

  var imageUrl = "";

  for (var i = 0; i < users.length; i++) {
  if (String(users[i][0]).trim() == String(userId).trim()) {
    imageUrl = "https://drive.google.com/uc?id=" + users[i][2];
    break;
  }
  }
  //이미지 받기 끝

  var userEmail = String(sh.getRange('G3').getValue() || '').trim().toLowerCase();
  var targetFolderId = BACKUP_FOLDER_ID;
  var targetFileName = BACKUP_FILE_NAME;

  if (JL_EMAILS.indexOf(userEmail) !== -1) {
    targetFolderId = JLFOLDERID;
    targetFileName = JLFILENAME;
  }

  var folder = DriveApp.getFolderById(targetFolderId);
  var files = folder.getFilesByName(targetFileName);
  var backupSS;
  if (files.hasNext()) {
    backupSS = SpreadsheetApp.open(files.next());
  } else {
    backupSS = SpreadsheetApp.create(targetFileName);
    DriveApp.getFileById(backupSS.getId()).moveTo(folder);
  }
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


  //이미지 박제
  if (imageUrl) {
  copied.getRange("B1").setFormula(
    '=IMAGE("' + imageUrl + '")'
  );
}
  //이미지 박제 종료


  // 데이터 아래 남은 깨진 수식(#REF!) 정리
  var maxR = copied.getMaxRows();
  if (maxR > lastRow) copied.getRange(lastRow + 1, 1, maxR - lastRow, numCols).clearContent();
}

/* ============================ EXPORT ============================= */

var BACKUP_FOLDER_ID = '0AD5atSBCNOrfUk9PVA';  //sam
var SHEXFILENAME = 'SAMS EXPORTED ORDERS';         //JOON   
var JLFOLDERID = '1zumfLOoj2BQ41djL5JWlsPRKXIQ1IcrP';  //JOON
var JLEXFILENAME = 'JOONS EXPORTED ORDERS';         //JOON   
var JL_EMAILS = ['joonlim@jennybs.com'];        // 이메일 추가 가능


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
  sh.getRange('G3').setValue(String(body.user || '').trim());

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
    backupExportTab_(sh, tabName);
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
function backupExportTab_(sh, tabName) {

  //이미지 주소 받기 08.05
  var userId = sh.getRange("G3").getValue();

  var users = sh.getParent()
  .getSheetByName("USERS")
  .getRange("A:C")
  .getValues();

  var imageUrl = "";

  for (var i = 0; i < users.length; i++) {
  if (String(users[i][0]).trim() == String(userId).trim()) {
    imageUrl = "https://drive.google.com/uc?id=" + users[i][2];
    break;
  }
  }
  //이미지 받기 끝

  var userEmail = String(sh.getRange('G3').getValue() || '').trim().toLowerCase();

  var targetFolderId = BACKUP_FOLDER_ID;
  var targetFileName = SHEXFILENAME;

  if (JL_EMAILS.indexOf(userEmail) !== -1) {
    targetFolderId = JLFOLDERID;
    targetFileName = JLEXFILENAME;
  }

  var folder = DriveApp.getFolderById(targetFolderId);
  var files = folder.getFilesByName(targetFileName);

  var backupSS;

  if (files.hasNext()) {
    backupSS = SpreadsheetApp.open(files.next());
  } else {
    backupSS = SpreadsheetApp.create(targetFileName);
    DriveApp.getFileById(backupSS.getId()).moveTo(folder);
  }

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
  if (imageUrl) {
  copied.getRange("B1").setFormula(
    '=IMAGE("' + imageUrl + '")'
  );
}
  //이미지 박제 종료

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