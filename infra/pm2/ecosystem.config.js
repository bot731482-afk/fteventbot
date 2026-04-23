module.exports = {
  apps: [
    {
      name: "core-api",
      script: "dist/main.js",
      cwd: "./apps/core-api",
      instances: 1,
      autorestart: true
    },
    {
      name: "bot-service",
      script: "dist/main.js",
      cwd: "./apps/bot-service",
      instances: 1,
      autorestart: true
    },
    {
      name: "scheduler-worker",
      script: "dist/main.js",
      cwd: "./apps/scheduler-worker",
      instances: 1,
      autorestart: true
    },
    {
      name: "billing-worker",
      script: "dist/main.js",
      cwd: "./apps/billing-worker",
      instances: 1,
      autorestart: true
    }
  ]
};
