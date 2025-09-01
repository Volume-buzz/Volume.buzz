module.exports = {
  apps: [
    {
      name: 'volume',
      script: 'dist/app.js',  // This starts BOTH bot and API server
      cwd: '/root/volume',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      },
      env_production: {
        NODE_ENV: 'production'
      },
      // PM2 configuration
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'dist'],
      restart_delay: 1000,
      max_restarts: 10,
      min_uptime: '10s',
      
      // Logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Advanced settings
      kill_timeout: 5000,
      listen_timeout: 3000,
      
      // Auto-restart on file changes (disabled for production)
      autorestart: true,
      
      // Graceful shutdown
      shutdown_with_message: true
    }
  ],

  // Development configuration (optional)
  deploy: {
    production: {
      user: 'root',
      host: 'localhost',
      ref: 'origin/main',
      repo: 'git@github.com:your-repo/volume.git',
      path: '/root/audius',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};