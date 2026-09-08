module.exports = {
  apps: [
    {
      name: "expo-metro",
      script: "metro.js",
      args: "--tunnel -c --port 8081",
      windowsHide: true,
      autorestart: false
    },
    {
      name: "expo-metro2",
      script: "metro.js",
      args: "--tunnel --web -c --port 8082",
      windowsHide: true,
      autorestart: false
    },
    {
      name: "git-autopull",
      script: "auto-pull.js",
      windowsHide: true,
      autorestart: true
    }
  ]
};