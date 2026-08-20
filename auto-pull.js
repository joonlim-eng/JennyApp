const { exec } = require('child_process');

setInterval(() => {
  exec('git pull', { windowsHide: true }, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    if (stdout && !stdout.includes('Already up to date.')) {
      console.log(`stdout: ${stdout}`);
    }
  });
}, 5000); // 5초마다 실행