const { spawn } = require('child_process');

// 윈도우 창 생성 없이 npx 명령을 백그라운드로 실행
const metro = spawn('npx.cmd', ['expo', 'start', '--tunnel', '-c'], {
  stdio: 'inherit',
  windowsHide: true,
  shell: true
});

metro.on('close', (code) => {
  console.log(`Metro process exited with code ${code}`);
});