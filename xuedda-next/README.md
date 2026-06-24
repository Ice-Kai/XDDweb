# 薛大大生态设计资源站

Astro SSR + MySQL 的设计资源下载站重建项目。当前阶段是本地/临时域名测试，后续正式迁移到阿里云大陆服务器。

## 当前状态

- 前台页面已接入 `xuedda.contents` 和 `legacy.lz_category`。
- 会员登录读取 `legacy.lz_member`，管理员登录读取 `legacy.lz_admin`。
- 下载链接不直接写入 HTML，必须登录后通过 `/api/download/[id]` 获取。
- 后台 API 已有基础鉴权、Origin 校验、限流和可信网盘链接白名单。
- GitHub 仓库：`Ice-Kai/XDDweb`，大型修改前保留本地备份。

## 本地运行

```sh
npm install
npm run dev
```

默认访问：

```text
http://127.0.0.1:4321/
```

MySQL 默认连接：

```text
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=xuedda_dev_pwd
DB_NAME=xuedda
```

如果数据库断开，先确认 Docker 容器：

```sh
docker start xuedda-mysql
```

## 后端建设优先级

1. 下载记录闭环：下载接口写入 `xuedda.logs`，会员中心展示最近下载。
2. 后台反馈管理：读取/回复 `xuedda.feedback`。
3. 后台内容管理增强：新增/编辑资源、封面、网盘链接、资源类型、大小。
4. 上传与媒体库：本地 `uploads/admin` 起步，后续切阿里云 OSS。
5. 会员管理：搜索用户、查看积分/VIP、手动调整测试状态。
6. 阿里云部署准备：PM2/Nginx/MySQL/OSS/HTTPS/备份策略。

## 安全注意

- 生产环境必须配置强 `SESSION_SECRET`。
- 测试站不要公开真实会员库注册入口，默认 `PUBLIC_REGISTRATION_ENABLED=false`。
- 后台状态变更接口只允许同源或 `ALLOWED_ORIGINS` 白名单。
- 网盘下载链接只允许可信 `https` 域名。
- `legacy.*` 是真实旧站数据，改写前必须先确认 SQL 影响范围。

## 最近进度

- 2026-06-24：恢复动态 SSR 能力，修复会员/后台/下载 API。
- 2026-06-24：安全加固，补 Session/Cookie/Origin/下载链接白名单。
- 2026-06-24：重设计左侧导航为资源工作台。
- 2026-06-24：开始后端建设，落地下载记录闭环。
