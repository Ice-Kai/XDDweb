# belongstoai.com 部署说明

## 当前目标

- `https://belongstoai.com/`：打开当前 Astro 新首页。
- `https://belongstoai.com/ai-image`：保留原来的 AI 生图工作台，作为同站子页面。
- 不再单独绑定 `ai.belongstoai.com`，也不再把 AI 生图跳到外部项目。

## 本地启动

```bash
cd /d/aliyun-site/xuedda-next
npm run build
node ./dist/server/entry.mjs
```

长期运行可以用：

```bash
pm2 start deploy/ecosystem.config.cjs
pm2 save
```

确认下面两个地址本地可访问：

- `http://127.0.0.1:4321/`
- `http://127.0.0.1:4321/ai-image`

## Cloudflare Tunnel

```bash
cloudflared tunnel login
cloudflared tunnel create belongstoai
cloudflared tunnel route dns belongstoai belongstoai.com
cloudflared tunnel route dns belongstoai www.belongstoai.com
cloudflared tunnel --config deploy/cloudflared-config.yml run
```

把 `deploy/cloudflared-config.yml` 里的 `<TUNNEL_ID>` 和 `credentials-file` 改成创建隧道后 Cloudflare 给你的真实值。

## Cloudflare 后台检查

1. DNS 里 `belongstoai.com` 和 `www.belongstoai.com` 应该指向 Cloudflare Tunnel。
2. 如果之前 root/www 绑定到了 Cloudflare Pages 或 Vercel 项目，要先解除冲突绑定。
3. AI 生图不需要单独域名，直接访问 `/ai-image`。

## 代码约定

- `src/pages/index.astro` 是首页。
- `src/pages/ai-image.astro` 是 AI 生图页。
- `src/layouts/Base.astro` 的导航已经固定指向内部 `/ai-image`，不再读取旧的 `settings.ai_image_url` 外链配置。

