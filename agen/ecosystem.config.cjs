// PM2 process config
module.exports = {
  apps: [
    {
      name: "telegram-ai-agent",
      script: "./index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
      error_file: "./logs/error.log",
      out_file: "./logs/out.log",
      time: true,
    },
  ],
}
