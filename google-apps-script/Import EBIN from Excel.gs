/**
 * 1. 파일 선택 HTML Dialog 팝업 열기
 */
function openFileDialog() {
  var html = HtmlService.createHtmlOutputFromFile('UploadDialog')
      .setWidth(450)
      .setHeight(250)
      .setTitle('엑셀 파일 선택');
  SpreadsheetApp.getUi().showModalDialog(html, '엑셀 파일 업로드');
}

/**
 * 팝업에서 선택한 엑셀 파일 처리 함수
 */

function processExcelFile(fileData) {
  var tempFileId = null;
  var importedSheet = null;
  var currentSS = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    console.log("[DEBUG] 1. 파일 데이터 검증 시작...");
    if (!fileData || !fileData.name || !fileData.content) {
      throw new Error("유효하지 않은 파일 데이터입니다.");
    }

    var fileName = fileData.name;
    var isExcel = fileName.match(/\.(xlsx|xls)$/i);
    if (!isExcel) {
      throw new Error("엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.");
    }

    var base64Data = fileData.content.split(',')[1];
    var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), fileData.mimeType, fileName);

    // 1. 임시 구글 스프레드시트 생성 (통째로 변환)
    console.log("[DEBUG] 2. 엑셀을 임시 구글 스프레드시트로 변환 중...");
    var resource = {
      title: '[TEMP] ' + fileName,
      mimeType: MimeType.GOOGLE_SHEETS
    };
    var tempFile = Drive.Files.insert(resource, blob, { convert: true });
    tempFileId = tempFile.id;

    var tempSS = SpreadsheetApp.openById(tempFileId);
    var originalSheets = tempSS.getSheets();

    // 2. COSYUREE 탭 F열(6번째 열) 왼쪽에 열 삽입
    var cosyureeSheet = tempSS.getSheetByName('COSYUREE');
    if (cosyureeSheet) {
      cosyureeSheet.insertColumnBefore(6);
      console.log("[DEBUG] 'COSYUREE' 탭 F열 왼쪽에 열 삽입 완료");
    }

    // 3. LASH 탭 B열(2번째 열) 삭제
    var lashSheet = originalSheets.find(function(s) {
      return s.getName().trim().toUpperCase() === 'LASH';
    });
    if (lashSheet) {
      lashSheet.deleteColumn(2);
      console.log("[DEBUG] 'LASH' 탭 B열 삭제 완료");
    }

    // 4. 임시 파일 내부에서 병합용 탭 생성 후 데이터+서식 통째 합치기
    console.log("[DEBUG] 4. 임시 파일 내 병합용 탭 생성 및 copyTo 병합 진행...");
    var tempCombinedSheet = tempSS.insertSheet('[TEMP_COMBINED]');
    var tempTargetRow = 1;

    originalSheets.forEach(function(sheet) {
      if (sheet.getName() === '[TEMP_COMBINED]') return;

      var lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        var numRows = lastRow - 1;
        var sourceRange = sheet.getRange(2, 2, numRows, 7); // B2:H 범위

        // 행 부족 방지
        var requiredMaxRow = tempTargetRow + numRows - 1;
        var currentMaxRow = tempCombinedSheet.getMaxRows();
        if (requiredMaxRow > currentMaxRow) {
          tempCombinedSheet.insertRowsAfter(currentMaxRow, requiredMaxRow - currentMaxRow);
        }

        var targetRange = tempCombinedSheet.getRange(tempTargetRow, 1);
        sourceRange.copyTo(targetRange);
        tempTargetRow += numRows;
      }
    });

    if (tempTargetRow === 1) {
      throw new Error("가져올 데이터(B2:G 범위)가 없습니다.");
    }

    var totalRows = tempTargetRow - 1;

    // 5. 합쳐진 임시 탭 자체를 현재 파일로 복사 (테두리, 색상, 폰트크기 등 100% 보존)
    console.log("[DEBUG] 5. 완성된 임시 탭을 현재 스프레드시트로 이관 중...");
    importedSheet = tempCombinedSheet.copyTo(currentSS);

    // 6. EBIN 탭 초기화 및 동일 파일 내 copyTo 실행
    var ebinSheet = currentSS.getSheetByName('EBIN');
    if (!ebinSheet) {
      ebinSheet = currentSS.insertSheet('EBIN');
    } else {
      ebinSheet.clear();
    }

    var ebinMaxRow = ebinSheet.getMaxRows();
    if (totalRows > ebinMaxRow) {
      ebinSheet.insertRowsAfter(ebinMaxRow, totalRows - ebinMaxRow);
    }

    var sourceRange = importedSheet.getRange(1, 1, totalRows, 6);
    var targetRange = ebinSheet.getRange(1, 1, totalRows, 6);

    // 동일 파일 내부 탭 간 copyTo는 원본 서식/테두리/포맷을 100% 유지함
    sourceRange.copyTo(targetRange);

    console.log("[DEBUG] 모든 작업 완성! 반영된 총 행 수: " + totalRows);
    return { success: true, message: "성공적으로 EBIN 탭에 데이터를 반영했습니다." };

  } catch (error) {
    console.error("[ERROR 발생]: " + error.message);
    console.error("[ERROR 스택]: " + error.stack);
    return { success: false, message: error.message };
  } finally {
    // 현재 파일로 가져온 임시 탭 삭제
    if (importedSheet) {
      try {
        currentSS.deleteSheet(importedSheet);
        console.log("[DEBUG] 이관용 임시 탭 삭제 완료");
      } catch (e) {
        console.error("[ERROR] 이관용 임시 탭 삭제 실패: " + e.message);
      }
    }
    // 임시 변환 파일 영구 삭제
    if (tempFileId) {
      try {
        Drive.Files.remove(tempFileId);
        console.log("[DEBUG] 임시 변환 파일 삭제 완료");
      } catch (e) {
        console.error("[ERROR] 임시 파일 삭제 실패: " + e.message);
      }
    }
  }
}