// pm2 process manager config — run the API server in production.
//   pm2 start ecosystem.config.js
//   pm2 start ecosystem.config.js --env production
// Set >1 instances for horizontal scaling; pull concurrency is guarded by a
// MySQL-backed lease (server/pullLock.js) so replicas won't double-run pulls.
module.exports = {
  apps: [
    {
      name: 'bse-api',
      script: 'server/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'development' },
      env_production: {
        NODE_ENV: 'production',
        TRUST_PROXY: '1',
      },
      max_memory_restart: '300M',
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
    },
  ],
};
