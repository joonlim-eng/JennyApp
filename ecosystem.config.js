module.exports = {
  apps: [
    {
      name: "expo-metro",
      script: "node_modules/expo/bin/cli.js",
      args: "start --tunnel",
      windowsHide: true,
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