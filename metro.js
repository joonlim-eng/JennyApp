const { exec } = require('child_process');

// { windowsHide: true } 를 넣어야 화면에 QR코드 창이 새로 뜨지 않고 백그라운드에 숨습니다.
const metro = exec('npx expo start --tunnel -c', { windowsHide: true });

metro.stdout.on('data', (data) => console.log(data));
metro.stderr.on('data', (data) => console.error(data));

metro.on('exit', (code) => {
  console.log(`Metro process exited with code ${code}`);
});