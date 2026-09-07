function onOpen() {
  hideOtherSheets();
  var ui = SpreadsheetApp.getUi();
}

function onSelectionChange(e) {
  hideOtherSheets();
}

function hideOtherSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var mainSheet = ss.getSheetByName("MAIN");
  
  if (mainSheet && mainSheet.getRange("E1").getValue() === "NO") {
    return;
  }

  if (CacheService.getScriptCache().get('SENDING')) return;

  var activeSheet = ss.getActiveSheet();
  var sheets = ss.getSheets();

  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var sheetName = sheet.getName();

    if (sheetName !== "MAIN" && sheetName !== activeSheet.getName()) {
      sheet.hideSheet();
    }
  }
}

function bypassHiding(){
  
  const ap = SpreadsheetApp.getActiveSheet().getName();

if (ap !== "MAIN"){
  return;
}

  const mc = SpreadsheetApp.getUi().prompt('Enter Code').getResponseText();

  SpreadsheetApp.getActiveSheet().getRange('E1').setValue(mc);

}     

function bypassHidingA(){

  const mc = SpreadsheetApp.getUi().prompt('Enter Code').getResponseText();

  SpreadsheetApp.getSheetByName("MAIN").getRange('E1').setValue(mc);

}

function extractImageUrlsFromActiveSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var sheetId = sheet.getSheetId();
  var url = "https://docs.google.com/spreadsheets/d/" + ss.getId() + "/gviz/tq?tqx=out:html&sheet=" + encodeURIComponent(sheet.getName());
  
  // 시트 HTML 소스 가져오기
  var options = {
    "headers": {
      "Authorization": "Bearer " + ScriptApp.getOAuthToken()
    }
  };
  
  var response = UrlFetchApp.fetch(url, options);
  var htmlContent = response.getContentText();
  
  // HTML 내에 포함된 이미지 태그 및 링크 추출
  var imgRegex = /<img[^>]+src="([^">]+)"/g;
  var match;
  var count = 0;
  
  var folderName = ss.getName() + " - " + sheet.getName() + " 이미지 링크";
  var folder = DriveApp.getFoldersByName(folderName).hasNext() ? DriveApp.getFoldersByName(folderName).next() : DriveApp.createFolder(folderName);
  
  while ((match = imgRegex.exec(htmlContent)) !== null) {
    var imgUrl = match[1];
    if (imgUrl.indexOf("http") === 0) {
      count++;
      try {
        var blob = UrlFetchApp.fetch(imgUrl).getBlob();
        blob.setName(sheet.getName() + "_img_" + count + ".png");
        folder.createFile(blob);
        Logger.log(count + "번째 이미지 다운로드 성공");
      } catch (e) {
        Logger.log(count + "번째 이미지 다운로드 실패: " + e.message);
      }
    }
  }
  
  Logger.log("총 " + count + "개의 이미지를 폴더에 저장했습니다.");
}

function clearAllCache() {
  var cache = CacheService.getScriptCache();
  // 그동안 썼던 캐시 키 이름들을 배열로 넣어서 싹 비우기
  cache.removeAll(['vendors', 'salesmen', 'storeData']); 
  Logger.log('GAS 캐시 삭제 완료!');
}


function checkEpoch() {
  var epoch = PropertiesService.getScriptProperties().getProperty('SESSION_EPOCH');
  Logger.log('현재 SESSION_EPOCH: ' + (epoch || '(비어있음)'));
}


function exportDataGROK() {
  // 주신 주소의 스프레드시트 ID
  const SPREADSHEET_ID = '1obbBED5KwdykO2snqm78hGCugYSVR660kOyjq1JIo6M';
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // ========== 1. STORES (STORE 탭) ==========
  const storeSheet = ss.getSheetByName('STORE');
  const stores = [];
  if (storeSheet) {
    const data = storeSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;
      stores.push({
        id: String(row[0] || ''),
        name: String(row[0] || ''),
        address: `${row[1] || ''}, ${row[2] || ''}`.trim()
      });
    }
  }

  // ========== 2. VENDORS (VENDOR 탭) ==========
  const vendorSheet = ss.getSheetByName('VENDOR');
  const vendors = [];
  const vendorMap = {};

  if (vendorSheet) {
    const data = vendorSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;

      const map = {
        upcCol:   String(row[3] || '-'),
        codeCol:  String(row[4] || '-'),
        descCol:  String(row[5] || '-'),
        costCol:  String(row[6] || '-'),
        imageCol: String(row[7] || '-'),
        qtyCol:   String(row[8] || '-')
      };

      const vendor = {
        id: String(row[0] || ''),
        name: String(row[0] || ''),
        salesPerson: String(row[1] || ''),
        email: String(row[2] || ''),
        map: map
      };
      vendors.push(vendor);
      vendorMap[vendor.name] = map;
    }
  }

  // ========== 3. PRODUCTS (각 벤더 탭) ==========
  const productTabs = [
    '7 DOLLAR', 'ABSOLUTE', 'ANNIE', 'BEESALES', 'DONNA',
    'EBIN', 'H2P', 'NEXT IMAGE', 'NICKA K', 'RNB', 'SM'
  ];

  const products = [];

  // 컬럼 문자를 인덱스로 변환 (A=0, B=1 ...)
  const colIndex = (letter) => {
    if (!letter || letter === '-') return -1;
    letter = letter.toString().toUpperCase().trim();
    let idx = 0;
    for (let i = 0; i < letter.length; i++) {
      idx = idx * 26 + (letter.charCodeAt(i) - 64);
    }
    return idx - 1;
  };

  productTabs.forEach(tabName => {
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) return;

    // 매핑 정보가 없으면 "-" 처리
    const map = vendorMap[tabName] || {
      upcCol: '-', codeCol: '-', descCol: '-',
      costCol: '-', imageCol: '-', qtyCol: '-'
    };

    const upcIdx   = colIndex(map.upcCol);
    const codeIdx  = colIndex(map.codeCol);
    const descIdx  = colIndex(map.descCol);
    const costIdx  = colIndex(map.costCol);
    const imageIdx = colIndex(map.imageCol);

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const row = data[i];

      // 유효한 컬럼이 하나도 없으면 스킵
      if (upcIdx < 0 && codeIdx < 0 && descIdx < 0) continue;

      products.push({
        upc:         upcIdx   >= 0 ? String(row[upcIdx]   || '') : '',
        itemCode:    codeIdx  >= 0 ? String(row[codeIdx]  || '') : '',
        description: descIdx  >= 0 ? String(row[descIdx]  || '') : '',
        cost:        costIdx  >= 0 ? (row[costIdx] || '') : '',
        vendorId:    tabName,
        imageUrl:    imageIdx >= 0 ? String(row[imageIdx] || '') : ''
      });
    }
  });

  // ========== 최종 결과 ==========
  const result = {
    stores: stores,
    vendors: vendors,
    products: products
  };

  const jsonString = JSON.stringify(result, null, 2);

  // 다운로드 다이얼로그
  const html = HtmlService.createHtmlOutput(`
    <html>
      <body style="font-family: Arial; padding: 20px;">
        <h3>데이터 추출 완료</h3>
        <p>아래 버튼을 누르면 <b>test.txt</b> 파일이 다운로드됩니다.</p>
        <button onclick="download()" style="padding:10px 20px; font-size:16px;">
          Download test.txt
        </button>
        <script>
          function download() {
            const content = ${JSON.stringify(jsonString)};
            const blob = new Blob([content], {type: 'text/plain;charset=utf-8'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'test.txt';
            a.click();
            URL.revokeObjectURL(url);
            google.script.host.close();
          }
        </script>
      </body>
    </html>
  `).setWidth(400).setHeight(200);

  SpreadsheetApp.getUi().showModalDialog(html, 'JSON Export');
}