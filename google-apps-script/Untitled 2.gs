function saveImagesToDrive() {
  // 1. 저장할 구글 드라이브 폴더 ID
  const FOLDER_ID = "1J1x8oMLo0AsRpei7NFTvhJtr-JFRIXoK";
  
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  const lastRow = sheet.getLastRow();
  
  // 데이터가 2행(헤더 제외) 미만이면 종료
  if (lastRow < 2) {
    Logger.log("처리할 데이터가 없습니다.");
    return;
  }

  // A열부터 I열까지 전체 데이터 가져오기 (2행부터 시작)
  // 열 인덱스: A열=0, H열=7, I열=8
  const range = sheet.getRange(2, 1, lastRow - 1, 9);
  const values = range.getValues();
  
  const resultUrls = [];

  for (let i = 0; i < values.length; i++) {
    const fileNameBase = values[i][0]; // A열 값
    const imageUrl = values[i][7];      // H열 이미지 링크

    // A열 또는 H열에 값이 없으면 건너뜀
    if (!fileNameBase || !imageUrl) {
      resultUrls.push([""]);
      continue;
    }

    try {
      // 이미지 링크에서 데이터 가져오기
      const response = UrlFetchApp.fetch(imageUrl, { muteHttpExceptions: true });
      
      if (response.getResponseCode() === 200) {
        const blob = response.getBlob();
        
        // 파일명 설정 (A열값.jpg)
        const fileName = `${fileNameBase}.jpg`;
        blob.setName(fileName);
        
        // 지정된 폴더에 파일 저장
        const file = folder.createFile(blob);
        
        // 생성된 파일의 URL 저장
        resultUrls.push([file.getUrl()]);
      } else {
        resultUrls.push([`오류: HTTP ${response.getResponseCode()}`]);
      }
    } catch (error) {
      // 다운로드 실패 시 에러 메시지 기록
      resultUrls.push([`오류: ${error.message}`]);
    }
  }

  // I열(9번째 열)에 결과 URL 한 번에 기록
  sheet.getRange(2, 9, resultUrls.length, 1).setValues(resultUrls);
  
  SpreadsheetApp.getUi().alert("이미지 저장 및 I열 링크 기록이 완료되었습니다.");
}