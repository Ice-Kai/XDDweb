// PM2 进程守护配置。部署后在 xuedda-next 目录执行：
//   pm2 start deploy/ecosystem.config.cjs
//   pm2 save && pm2 startup   # 开机自启
// 改了代码重新构建后：pm2 reload xuedda
module.exports = {
  apps: [{
    name: 'xuedda',
    script: './dist/server/entry.mjs',   // Astro node standalone 产物入口
    // cwd 默认取启动时所在目录；如用绝对路径请改成服务器上的项目路径
    env: {
      HOST: '127.0.0.1',                 // 只监听本机，由 Nginx 反代对外
      PORT: '4321',
      NODE_ENV: 'production',
    },
    instances: 1,                        // SSR + 内存限流是单机内存，先单实例
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '600M',
    time: true,
  }],
};
