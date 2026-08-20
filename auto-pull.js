const { execSync } = require('child_process');
setInterval(() => {
  try {
    exec('git pull', { windowsHide: true }, (error, stdout, stderr) => { ... });
  } catch (e) {
    // 에러 발생 시 무시
  }
}, 3000);