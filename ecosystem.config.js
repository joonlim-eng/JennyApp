module.exports = {
  apps: [
    {
      name: "expo-metro",
      script: "metro.js",
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