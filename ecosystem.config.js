module.exports = {
  apps: [
    {
      name: "expo-metro",
      script: "npx",
      args: "expo start --tunnel",
      autorestart: true
    },
    {
      name: "git-autopull",
      script: "auto-pull.js",
      autorestart: true
    }
  ]
};