const { spawn } = require('child_process');

// --non-interactive 옵션을 추가하여 백그라운드 대기 상태(CommandError)를 방지합니다.
const metro = spawn('npx.cmd', ['expo', 'start', '--tunnel', '--non-interactive', '-c'], {
  windowsHide: true,
  shell: true
});

metro.stdout.on('data', (data) => console.log(data.toString()));
metro.stderr.on('data', (data) => console.error(data.toString()));
metro.on('close', (code) => console.log(`Metro process exited with code ${code}`));