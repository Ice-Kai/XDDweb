# 后台上传方案 — xuedda 重建

> 状态：**待用户确认**（用户口径：先本地存储、覆盖所有内容类型、先出方案文档再动手）。
> 编写：2026-06-18。落在真实 schema（`db/schema.sql`）与数据层（`src/lib/content.ts`）之上。
> 确认后按 §7 分阶段实施。

## 架构总纲（2026-06-18 确认：方案 B 后台分离）

- **前台**（访客页，要 SEO）：**保持 Astro SSR 不变**，已搭好的页面不浪费。
- **后台**（admin，无 SEO 需求）：做成**独立 React SPA**，挂在 `/admin`，纯调 API。
- **API 层独立**：`/api/admin/*` 设计成干净的 REST（标准路径 + 统一 JSON 响应 `{code,msg,data}` + 统一鉴权），不只服务 admin，将来微信小程序/App 可复用同一套接口。
- 前台仍直接查库（`content.ts`），**暂不改造**（那是方案 B+ 的事，本期不做）。

---

## 0. 设计目标与硬约束

| 约束 | 决策 |
|------|------|
| 存储位置 | **先本地磁盘**，OSS 留待后续。**关键：存储做成抽象层，切 OSS 只改一个文件 + `.env`。** |
| 内容范围 | 全部类型：封面图/正文图、下载资源（网盘链接+提取码）、视频教程文件、媒体库 |
| 服务器 | 阿里云大陆，Astro SSR（`@astrojs/node` standalone）。`.env` 已预留 `OSS_*` |
| 安全 | 后台需登录鉴权（`admins` 表，旧 MD5 → 首登升级 bcrypt） |
| 不破坏现状 | 前台仍读 `legacy.lz_download`；后台先写 **新库 `contents`**，二者并存，迁移阶段再统一 |

**核心原则**：上传链路与「资源发布表单」解耦。先打通"文件进得来、媒体库管得住"，再让各内容类型表单复用它。

---

## 1. 存储抽象层（最重要 — 决定 OSS 切换成本）

新建 `src/lib/storage/`，对外暴露统一接口，内部两套实现：

```ts
// src/lib/storage/index.ts
export interface StoredFile {
  url: string;        // 可公开访问的最终 URL（本地: /uploads/... ; OSS: https://bucket.../...）
  key: string;        // 存储相对路径，入库 assets.url 用
  size: number;
  md5: string;
  suffix: string;
}
export interface Storage {
  save(buf: Buffer, opts: { suffix: string; md5: string; subdir?: string }): Promise<StoredFile>;
  // 分片：初始化 / 存块 / 合并
  initMultipart(opts): Promise<{ uploadId: string }>;
  putPart(uploadId, partNo, buf): Promise<{ etag: string }>;
  complete(uploadId, parts): Promise<StoredFile>;
  delete(key: string): Promise<void>;
  exists(md5: string): Promise<StoredFile | null>;  // 秒传查重，查 assets 表
}
```

- `local.ts` — 写 `public/uploads/admin/<yyyy>/<mm>/<md5>.<ext>`，返回 `/uploads/admin/...`。分片先落临时块文件，合并时拼接。
- `oss.ts` — 后续接 `ali-oss` SDK（`.env` 的 `OSS_*` 已就位），接口签名完全一致。
- 工厂：`getStorage()` 读 `import.meta.env.STORAGE_DRIVER`（`local` | `oss`，默认 `local`）。

> ⚠️ 注意：现有 `public/uploads` 是指向旧站 2 万图的 **junction**。新上传写到子目录 `uploads/admin/` 下，**不混入旧图目录**，也避免生产构建把新文件再拷一遍。junction 只读旧图，新图走 admin 子目录。

**切 OSS 时只需**：① 实现 `oss.ts`（接口已定）② `.env` 设 `STORAGE_DRIVER=oss` ③ 写个脚本把 `uploads/admin/` 已传文件搬到 OSS 并改 `assets.url`。业务代码零改动。

---

## 2. 上传组件（前端，现代化拖拽/分片）

`src/components/admin/Uploader`（React 19，岛屿模式 `client:load`）：

- **拖拽 + 点选**，多文件队列，每文件独立进度条/重试/取消。
- **分片**：>10MB 自动切 5MB 分片并发上传（视频教程必需）；小文件单请求直传。
- **秒传**：上传前前端算 MD5（`SubtleCrypto`），先 `POST /api/admin/upload/check`，命中 `assets` 表则跳过实传，直接拿 URL。
- **图片**：即时预览缩略图；可选前端压缩（封面不必须）。
- **校验**：按 `accept` 限制类型/大小，前端拦一道，后端再拦一道。

替代旧站百度 WebUploader + UMEditor 本地存储那套。正文富文本编辑器（替代 UMEditor）建议用轻量的 **Tiptap/Milkdown**（React 友好），图片粘贴/拖拽走同一上传接口。

---

## 3. 后端 API（Astro endpoints，`src/pages/api/admin/`）

| 路由 | 方法 | 作用 |
|------|------|------|
| `/api/admin/upload/check` | POST | 传 `{md5, suffix, size}` → 命中 `assets` 返回已存 URL（秒传），否则放行 |
| `/api/admin/upload` | POST | 单文件 multipart：落盘 → 写 `assets` → 返回 `StoredFile` |
| `/api/admin/upload/init` | POST | 初始化分片，返回 `uploadId` |
| `/api/admin/upload/part` | POST | 上传单个分片 |
| `/api/admin/upload/complete` | POST | 合并分片 → 写 `assets` → 返回 URL |
| `/api/admin/media` | GET | 媒体库列表（分页/搜索/类型筛选，查 `assets`） |
| `/api/admin/media/:id` | DELETE | 删除素材（删文件 + `assets` 行；被引用则拒绝/软删） |
| `/api/admin/content` | POST/PUT | 资源发布/编辑，写 `contents`（见 §4） |

**所有 `/api/admin/*` 经鉴权中间件**（`src/middleware.ts`，校验 session cookie / Bearer token；`SESSION_SECRET` 已在 `.env`）。统一响应体 `{ code: 0, msg: '', data: ... }`，非 0 即错误。
**`/admin` 是单一 SPA 入口页**（一个 `admin/[...path].astro` 吐出 React 挂载点），路由由前端 React Router 接管，所有数据走 `/api/admin/*`。

---

## 4. 各内容类型 → 表单 → 落库映射

后台「新增资源」按 `type` 切换字段，统一写 `contents`（课程写 `courses`+`course_chapters`）：

| 类型 | 关键字段（contents） | 文件去向 |
|------|----------------------|----------|
| **下载资源**（主力） | title, category_id, cover_url, summary, body, **file_url=网盘链接**, **extract_pass=提取码**, price_money, price_integral, just_vip | 封面图传本地/OSS；**资源本体在百度网盘，只存链接，不上传** |
| **灯光/贴图** | 同下载，type=download | 封面 + （可选）素材包文件上传 |
| **软件/参数** | 同下载 | 封面 + 网盘链接 |
| **视频教程** | type=mp4 或 course；mp4 用 `file_url`+`meta`；课程拆 `courses`+章节 | **视频文件上传（分片）** 或网盘链接，二选一 |
| **图片/图集** | type=picture，多图存 `meta.images` JSON | 多图上传 |
| **正文内图** | 任意类型的 `body` 富文本内嵌 | 编辑器内拖拽上传，复用 §3 接口 |

> 旧库无「文件大小」字段（HANDOFF 已记 filename 全空）。新上传的本地/OSS 文件会有真实 `size`（存 `assets`），可回填到内容详情展示「模型大小」。**网盘类资源**仍无大小，表单留手填可选项。

---

## 5. 媒体库（已传素材管理）

- 页面 `/admin/media`：网格视图，缩略图 + 文件名/大小/上传时间/引用计数。
- 能力：搜索、按类型（图/视频/其他）筛选、复制 URL、删除（被引用时拦截）、复用（在表单里"从媒体库选"）。
- 数据全在 `assets` 表（已存在，含 `file_md5` 去重索引）。

---

## 6. 数据库改动

`schema.sql` 的 `assets` 表基本够用，**建议小幅增补**（确认后我出 `db/alter_assets.sql`）：

```sql
ALTER TABLE assets
  ADD COLUMN driver    VARCHAR(10)  NOT NULL DEFAULT 'local' AFTER url,   -- local/oss，便于迁移期混存
  ADD COLUMN mime      VARCHAR(100) NOT NULL DEFAULT ''      AFTER suffix,
  ADD COLUMN kind      VARCHAR(20)  NOT NULL DEFAULT 'image' AFTER mime,  -- image/video/file
  ADD COLUMN ref_count INT          NOT NULL DEFAULT 0,                    -- 引用计数，删除保护
  ADD UNIQUE KEY uk_md5 (file_md5);                                       -- 秒传唯一
```

其余表（`contents`/`courses`/`admins`）已满足。

---

## 7. 实施阶段（确认后逐步交付，每步可单独验证）

1. ✅ **存储抽象层 + 本地驱动**（§1）—— 已交付并验证（`src/lib/storage/`）。
2. ✅ **后台鉴权骨架 + SPA 壳**：scrypt 密码 + HMAC 会话 + 中间件保护 `/api/admin/*` + `/admin` React Router SPA。已验证登录/登出/me。
   - 临时管理员：`admin` / `admin123`（scrypt 哈希入 `xuedda.admins`，生产前改）。
   - ⚠️ Astro 6 默认 `checkOrigin` CSRF 保护：浏览器 XHR 自动带 Origin 正常；curl 测上传需 `-H "Origin: http://localhost:4321"`。
3. ✅ **单文件上传闭环**：`/api/admin/upload`(multipart) + `assets` 入库 + md5 服务端去重 + 媒体库列表/删除/静态访问，全链路已验证。含拖拽/进度条 Uploader（在媒体库页）。
4. **Uploader 增强**：真·客户端秒传（需 `spark-md5`，因浏览器 SubtleCrypto 不支持 MD5）；当前靠服务端去重。`/api/admin/upload/check` 接口已就绪待接。
5. **分片上传**：init/part/complete + 大视频验证。
6. ✅ **资源发布工作流（核心，参考老 LzCMS / D:\ChatGpt 版后台）**：完整发布表单写 `contents`——
   - 基础信息(标题/别名/摘要/正文) + 内容类型 + **真实多级分类树多选**(读 `legacy.lz_category` 148 类) + 封面上传/URL + SEO + 发布状态/可见性/精选/价格。
   - **一条资源绑多个网盘文件**(标签/链接/提取码/大小) + **「识别剪贴板」**自动解析百度网盘分享文本。
   - **批量导入**:粘贴文本/导入 TXT → 自动拆条 → 批量写库;批量上传封面按顺序匹配。(`src/lib/baidu.ts` 解析前后端共用)
   - 内容列表(分页/搜索/类型筛选/编辑/删除)。API:`/api/admin/categories`、`/api/admin/content`(GET/POST)、`/content/[id]`(GET/PUT/DELETE)、`/content/batch`。全部已验证。
7. **其余增强**：富文本编辑器 Tiptap 内嵌上传(正文现为 textarea 占位)；其余类型(图集多图/课程章节)表单。
8. **媒体库完善**：搜索/筛选/删除保护/复用选择器。
9. （后续）**OSS 驱动** + 本地已传文件迁移脚本。

> 建议先做 1→3，跑通"一张封面图传上来、进媒体库、拿到 URL"这个最小闭环给你看，再继续。

---

## 8. 小决策（2026-06-18 已确认）

- **富文本编辑器**：✅ **Tiptap**（React）。
- **后台路由前缀**：✅ `/admin`。
- **本地上传目录**：✅ `public/uploads/admin/年/月/`。
- **视频教程**：✅ **走网盘链接**为主 → **分片(阶段5)降级**，先不做；后续要传大视频再补。

→ 已开工，从阶段 1（存储抽象层）开始。
