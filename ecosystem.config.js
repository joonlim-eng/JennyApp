module.exports = {
  apps: [
    {
      name: "expo-metro",
      script: "cmd.exe",
      args: "/c npx expo start --tunnel",
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