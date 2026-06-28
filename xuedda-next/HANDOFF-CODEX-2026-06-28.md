# XDesign / 薛大大设计网接手记录

更新时间：2026-06-28 15:25

## 当前部署

- 本地项目：`D:\aliyun-site\xuedda-next`
- 线上项目：`/www/wwwroot/xuedda-next`
- 服务器：`101.200.218.81`
- 进程管理：PM2 应用 `xuedda-next`
- 旧 PHP 站：已按当前策略暂停，`xuedda.com` 直接走新站。

## 这次改动

- 会员中心改成“表格型下载记录”，去掉大图卡片。
- 页面文件：`src/pages/member/index.astro`
- 下载记录 API：`src/pages/api/member/downloads.ts`
- 本地已执行 `npm run build`，构建通过。

## 会员中心逻辑

- 未登录访问会员中心会跳转到 `/member/login`。
- 下载记录从 `/api/member/downloads?limit=50` 读取。
- 记录展示字段：序号、资源名称、类型、大小、下载时间、状态、操作。
- “打开链接”仍复用全局下载弹窗逻辑，按钮带 `btn-dl` 和 `data-download-id`。
- 会员中心不再显示素材封面图片，避免页面过重和视觉混乱。

## 登录与下载限制

- 游客可以浏览前台资源。
- 点击下载链接必须登录或注册。
- 当前规则：所有素材免费下载，但每个用户每天最多打开 30 个下载链接。
- 注册已加入基础防刷：按 IP 和设备指纹限制频率。
- 登录页已有验证码占位逻辑，后续可替换为阿里云真人验证。
- 忘记密码入口已加入，当前先记录找回申请，后续可接入短信、邮箱或管理员重置。

## QQ / 微信登录

- QQ 登录已接入旧站回调兼容路径：
  - `https://www.xuedda.com/index/member/other_login.html`
- QQ 环境变量：
  - `QQ_APP_ID=101441530`
  - `QQ_APP_KEY=已配置，勿写入文档或 Git`
  - `QQ_CALLBACK_URL=https://www.xuedda.com/index/member/other_login.html`
- 微信登录代码骨架已预留，但还需要正式的 `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET` 才能完整联调。

## 数据库与素材

- 新站继续连接服务器上的真实数据库。
- 前后台栏目逻辑已尽量向前台一致：模型素材、灯光贴图、软件参数等分类由数据库栏目控制。
- 后续上线商业化前，建议再做一次数据库备份和上传目录备份。

## 服务器备份点

- 游客登录与认证改动备份：`/root/xuedda-deploy-backups/20260628-144537-guest-auth`
- QQ OAuth 改动备份：`/root/xuedda-deploy-backups/20260628-145900-oauth-qq`
- 本次会员中心表格化部署前也应创建新的备份目录。

## 交接提醒

- 不要把 QQ/微信密钥写入 Git。
- 不要默认推 GitHub，等用户明确要求再推。
- 修改前台样式时注意 Astro 的 `<style>` 作用域问题；动态 JS 创建的元素需要全局样式或 `is:global`。
- 如果线上图片丢失，优先检查 `/www/wwwroot/xuedda-next/public/uploads` 或旧站上传目录映射，而不是先改数据库。
