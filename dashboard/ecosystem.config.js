module.exports = {
  apps: [
    {
      name: 'oauth-frontend',
      script: './node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      cwd: '/root/audius/oauth-frontend',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        BACKEND_URL: 'http://localhost:3000'
      },
      error_file: '/root/audius/logs/oauth-error.log',
      out_file: '/root/audius/logs/oauth-out.log',
      log_file: '/root/audius/logs/oauth-combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '30s'
    }
  ]
};