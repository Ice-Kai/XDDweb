module.exports = {
  apps: [
    {
      name: 'xuedda-next',
      script: './server-start.cjs',
      cwd: '/www/wwwroot/xuedda-next',
      env: {
        NODE_ENV: 'production',
        HOST: 'localhost',
        PORT: '4321',
      },
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      max_memory_restart: '700M',
      time: true,
    },
  ],
};
