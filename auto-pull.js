const { execSync } = require('child_process');
setInterval(() => {
  try {
    execSync('git pull');
  } catch (e) {
    // 에러 발생 시 무시
  }
}, 3000);