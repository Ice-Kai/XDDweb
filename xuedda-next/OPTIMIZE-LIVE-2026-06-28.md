# 线上优化清单（发给 Codex 执行）— www.xuedda.com

> 来源：2026-06-28 对线上站 `https://www.xuedda.com/` 的真实体检（SSH + 公网抓取）。
> 服务器：阿里云 ECS `101.200.218.81`，CentOS 7.9，宝塔面板。项目 `/www/wwwroot/xuedda-next`，PM2 进程 `xuedda-next`（端口 4321），Nginx 反代，DB=MySQL `www_xuedda_com`。
> 现状：站点整体正常（首页 180 张卡片、真实数据；下载接口 `/api/download/<id>` 未登录返回 401 正常）。以下是按优先级排列的优化项。

---

## 🔴 P0 — 旧站 SEO 链接全失效（最该先修，直接掉自然流量）

**现象**：Nginx 错误日志里大量来自**搜索引擎/Google 跳转**的旧 ThinkPHP URL，命中新站后 404 / 502（旧站路由不存在）：
```
GET /index/download/show/id/1782.html      referrer: https://www.google.com/
GET /index/download/lists/category_id/214.html
GET /index/download/show/id/2379.html
GET /index/download/lists/category_id/298.html
```
这些是旧 PHP 站被百度/Google 收录多年的地址，现在全打不开 → 旧站积累的搜索流量在流失。

**要做**：在 Nginx（宝塔站点配置 `/www/server/panel/vhost/nginx/www.xuedda.com.conf` 或站点根 `.conf`）对旧 URL 做 **301 永久跳转**到新路由。已知映射：
- `/index/download/show/id/<id>.html` → `/d/<id>`（详情页，id 直接复用 contents.id，旧 lz_download.id 已迁移保留）
- `/index/download/lists/category_id/<cid>.html` → 分类列表。`<cid>` 是 legacy 分类 id，新站 `/c/[slug]?category=<cid>` 用的是同一套 id。需按 `<cid>` 所属顶层栏目决定 slug（model/texture/software/video/other）——可在应用层做：建一个 `/index/[...legacy].ts` 端点解析旧路径、查 `contents`/`categories` 决定目标、返回 301。
- 其它旧形态也要覆盖：`/article/`、`/course/`、`/picture/`、`/mp4/`、`/question/` 等。**务必先 grep 全量**：
  ```
  grep -ohE 'GET /[a-z]+/[a-z]+/[^ ]+' /www/wwwlogs/*xuedda*error*.log /www/wwwlogs/*xuedda*access*.log | sort | uniq -c | sort -rn | head -60
  ```
  按出现频次把 Top 模式都建 301。

**建议实现方式（择一）**：
1. **Nginx 正则 301**（最快、零应用负担），示例：
   ```nginx
   location ~ ^/index/download/show/id/(\d+)\.html$ { return 301 /d/$1; }
   # 分类列表交给应用解析（id→栏目）：
   location ~ ^/index/(download|article|course|picture|mp4|question)/ { proxy_pass http://127.0.0.1:4321; }
   ```
2. **应用层 catch-all**：新建 `src/pages/index/[...rest].astro`（或中间件）解析旧路径 → `Astro.redirect(target, 301)`。详情类直接 `/d/<id>`；列表类查 DB 定栏目。
- 完成后用 `curl -sI https://www.xuedda.com/index/download/show/id/1782.html` 应看到 `301` → `Location: /d/1782`。

---

## 🔴 P0 — robots.txt 404 + sitemap.xml 502

**现象**：`/robots.txt` → 404、`/sitemap.xml` → 502。搜索引擎没有抓取指引、拿不到站点地图，新站收录慢。

**要做**：
1. 加 `public/robots.txt`：
   ```
   User-agent: *
   Allow: /
   Sitemap: https://www.xuedda.com/sitemap.xml
   ```
2. 生成 **sitemap**：用 `@astrojs/sitemap`，或写 `src/pages/sitemap.xml.ts`（`prerender=false`）动态列出 `/`、各 `/c/<slug>`、以及 `contents` 里 `is_show=1` 的 `/d/<id>`（4000 条，可分页或限制）。`Content-Type: application/xml`。
3. 验证：`curl -sI https://www.xuedda.com/sitemap.xml` → 200 + xml。

---

## 🔴 P1 — 部署导致短暂 502（零停机）

**现象**：Nginx 日志多次 `connect() failed (111: Connection refused)` / `no live upstreams`，对应 PM2 重启窗口（↺8 次）。每次部署用户会瞬时看到 502。

**要做**：
- PM2 改 **cluster 模式 + `pm2 reload xuedda-next`**（滚动重启、零停机），而不是 `restart`。
- 或部署脚本里：先 `pm2 reload`，并给 Nginx upstream 加 `proxy_next_upstream` 容错。
- 部署脚本建议固定化（见 P2 的"清理旧资源"）。

---

## 🟠 P2 — 安全响应头缺失

**现象**：只有 `Strict-Transport-Security`（HSTS），缺点击劫持/嗅探/CSP 防护。

**要做**：Nginx server 块加：
```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
# CSP 先用宽松版灰度，逐步收紧：
add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'" always;
```
（CSP 注意：站内有 inline `<script is:inline>` 和 inline style，先放开 `'unsafe-inline'`，别一上来打碎页面。）

---

## 🟠 P2 — 失效的旧静态资源引用

**现象**：日志 `open() ".../dist/client/_astro/Base.DG_JkR0I.css" failed (No such file)`——某次部署后旧 HTML 仍引用已删的 hash 化 CSS，偶发样式丢失。

**要做**：部署时**先清空 `dist/client/_astro` 再放新构建产物**（避免新旧 hash 资源混存导致引用错位）；或确认 Nginx 没缓存旧 HTML。

---

## 🟡 P3 — 文案/品牌未同步（本地已改，线上未部署）

- 线上首页 Hero 仍是旧文案「从入门到拟真 / 实战项目教学」；本地已改为 **「XDesign，网站全新上线」**（`src/lib/settings.ts` 的 `DEFAULT_HERO`，且需确保线上 DB `settings.home_hero` 未覆盖——本地已删该行回落默认）。**部署时同步**。
- 页面 `<title>` 仍为「薛大大设计网」，Logo 已是 **XDesign · 薛大大生态设计**。建议统一 `<title>`/品牌（`Base.astro` 的 `title` 默认值）。

---

## 🛠️ 管理/运维（非代码，提示用户或宝塔侧）

| 项 | 现状 | 建议 |
|----|------|------|
| 磁盘 | 40G 用 67%，约 7G 冗余备份(`/root/*.tgz`、`/www/wwwroot/www.xuedda.com_LEaJCk.tar.gz`)、journal 1.7G、binlog 700M | 清理（用户暂缓）；`journalctl --vacuum-size=200M`；清旧 binlog |
| 备份 | 11.8 万会员，未见定时备份 | 宝塔配 DB + `public/uploads` 定时备份 |
| 监控 | 无 | 宝塔监控/进程守护告警 |
| HTTP/2 | 首页走的是 HTTP/1.1（部分请求是 HTTP/2） | Nginx 站点统一开 `http2` |
| 旧站目录 | `/www/wwwroot/www.xuedda.com`(3G) 已暂停 | 删前先确认新站 `public/uploads` 是否依赖其上传目录映射 |

---

## ✅ 体检确认良好的（不用改）
- 应用层安全扎实：会话 HMAC、scrypt 密码、OAuth state 防 CSRF、验证码服务端校验、找回密码防枚举、下载链接域名白名单、IDOR 防护、限流、XSS 消毒、Cookie HttpOnly+SameSite+Secure。
- 下载鉴权正常（未登录 401）、HTTPS + HSTS、gzip 压缩、首页 TTFB ~0.17s。

> ⚠️ 服务器层另有两个**基础设施暴露**（MySQL 3306、宝塔面板 22732 对公网开放）——这两个走阿里云安全组关闭，**不在本清单（非应用代码）**，由用户处理。
