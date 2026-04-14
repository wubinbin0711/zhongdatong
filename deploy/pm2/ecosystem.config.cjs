module.exports = {
  apps: [
    {
      name: "zdt-api",
      cwd: "/var/www/zdt",
      script: "node",
      args: "server/dist/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 3001
      }
    }
  ]
};

