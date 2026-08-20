module.exports = {
  apps: [
    {
      name: "expo-metro",
      script: "npx",
      args: "expo start --tunnel -c",
      autorestart: true
    },
    {
      name: "git-autopull",
      script: "auto-pull.js",
      windowsHide: true,
      autorestart: true
    }
  ]
};