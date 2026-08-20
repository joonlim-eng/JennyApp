module.exports = {
  apps: [
    {
      name: "expo-metro",
      script: "cmd.exe",
      args: "/c npx expo start --tunnel -c",
      autorestart: true
    },
    {
      name: "git-autopull",
      script: "auto-pull.js",
      autorestart: true
    }
  ]
};