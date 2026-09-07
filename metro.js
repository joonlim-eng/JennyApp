const { spawn } = require('child_process');

// PM2에서 전달해준 args를 파싱하여 expo start 뒤에 붙입니다.
const args = ['expo', 'start', ...process.argv.slice(2)];

const metro = spawn('npx.cmd', args, {
  windowsHide: true,
  shell: true,
  env: { ...process.env, CI: '1' }
});

metro.stdout.on('data', (data) => console.log(data.toString()));
metro.stderr.on('data', (data) => console.error(data.toString()));
metro.on('close', (code) => console.log(`Metro process exited with code ${code}`));