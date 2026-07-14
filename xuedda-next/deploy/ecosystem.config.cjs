module.exports = {
  apps: [
    {
      name: 'xuedda-next',
      script: './server-start.cjs',
      cwd: '/www/wwwroot/xuedda-next',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '4321',
      },
      // Image generation keeps each in-flight task as an in-memory promise
      // (see src/pages/api/ai-image/generate.ts activeTasks). Cluster mode split
      // that state across workers and the 700M cap got blown by 4K image buffers,
      // so PM2 kept killing workers mid-generation and orphaning tasks. Run a
      // single process with a realistic memory ceiling instead.
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1800M',
      node_args: '--max-old-space-size=1536',
      time: true,
    },
  ],
};
