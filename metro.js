const { spawn } = require('child_process');

// CI=1 환경변수를 주입하여 백그라운드 대기 및 터널 키보드 입력을 자동으로 우회합니다.
const metro = spawn('npx.cmd', ['expo', 'start', '--tunnel', '--web', '-c'], {
  windowsHide: true,
  shell: true,
  env: { ...process.env, CI: '1' }
});

metro.stdout.on('data', (data) => console.log(data.toString()));
metro.stderr.on('data', (data) => console.error(data.toString()));
metro.on('close', (code) => console.log(`Metro process exited with code ${code}`));