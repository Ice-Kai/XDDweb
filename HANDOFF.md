# 项目交接说明 — xuedda.com 重建

> 写给接手本项目的下一个 AI（Claude）。请**先完整读这份文档**，再读同目录 `SITE_ARCHITECTURE.md`（旧站完整架构）。
> 最近更新：2026-06-19（含字号调节/下载弹窗/首页5列 + AI生图工作台深色版）。**全站前端已搭完并接真实数据**；**前台会员鉴权 + 下载鉴权已落地（真实）**；后台系统(admin)已具备；**AI生图工作台 UI 完成(后端待接模型，见 §4.6)**；环境/数据库就绪。**唯一上线硬缺口 = 微信支付**（需商户凭证）。

### §0.1 最新一批前台改动（2026-06-19，均在 `Base.astro` + `global.css`）
- **字号调节（阅读模式）**：顶栏「Aa」按钮→滑块(90%–160%)，缩放 `main` 内容，记忆 localStorage `xdd-fontsize`。
- **下载弹窗（重要交互）**：点卡片 `.btn-dl`「下载」**不再跳详情页**，全局委托拦截→调 `/api/download/[id]`→弹小窗显示网盘链接(?pwd 自动填充)+提取码+复制；未登录弹登录、非VIP弹开通。弹窗 markup=`#dlModal`、JS 在 Base 首个 `<script>`。"查看"类按钮(文本非"下载")仍正常进详情。
- **首页每版块 5 个一行**：`index.astro` 各 `getLatestDownloads` limit 改 5；`.grid-5=repeat(5,1fr)` 固定列(**勿改 auto-fill**)。
- **AI生图 `/ai-image`**：重做成**深色高级感**工作台(局部覆盖 token 为深色，金色渐变标题)，三栏=生成历史 / 画布 / 参数；后端仍占位(见 §4.6)。
> 另有两份必读：技能 `.claude/skills/xuedda-frontend/SKILL.md`（前台设计系统+信息架构+后台对齐规范，**改 UI 前先看**）、`ADMIN_UPLOAD_PLAN.md` + 记忆 `admin-architecture.md`（后台上传方案）。

---

## 0. 一句话背景
把 2016 年的中文付费内容 CMS（`xuedda.com`，ThinkPHP/PHP5.6/LZ-CMS）用现代技术栈重建。**核心是付费下载站**：`薛大大` = SketchUp/Lumion/Enscape/VRAY/D5/CAD 等**建筑·室内·景观设计**的「软件·插件·参数·模型·贴图·视频教程」下载站。下载链接是**百度网盘**。

---

## 1. ⚠️ 必守纠正（用户强调）
1. **领域不是考试站**，是设计资源站（见上）。真实一级分类：模型(107)/灯光和贴图(91)/软件和参数(88)/视频教程(89)/问答整理(44)/薛大大新闻(2)/其他相关(339)。
2. **不要 AI 生成配图**，用户自己加。现有图：`public/hero`、`public/img`（首页占位）；模型/详情等已接旧库真实封面（见 §4）。
3. **大陆为主**：应用+数据库**留阿里云大陆**，MySQL + 阿里云 OSS，**不用 Cloudflare D1/R2/Workers 边缘**。CF 只做 DNS（灰云指向阿里云）。域名**已 ICP 备案**。
4. **完整保留付费体系**：微信支付(NATIVE/JSAPI/MWEB)+月/季/年卡+激活码+积分签到+课程购买。
5. **品牌名暂用「薛大大设计网」不改**（真实全名薛大大生态设计，用户说先不改）。
6. **首页不展示统计数字**（多少资源/会员都不放）。会员真实数 118,300（仅心里有数）。

## 2. 🔶 待用户拍板
- **两种交付方案，二选一**：① 双站并存（旧站不动，用户选新/旧站）② 整站重构替代。**动手部署前先问**。
- **后台上传重建方案**：用户**还在考虑**，先别动（替换旧站百度 WebUploader+UMEditor 存本地的方式，做现代化拖拽/分片/媒体库直传 OSS）。
- 开场动画是否「每会话一次」已实现（见 §4 UX）；公众号/社群真实链接待用户给。

---

## 3. 技术栈 & 环境
- 项目：`D:\aliyun-site\xuedda-next`。**Astro 6**(SSR, `@astrojs/node` standalone) + **Tailwind v4**(但设计系统主要是手写原生 CSS) + **React 19**(预留) + **mysql2**。Node v24。
- **Docker MySQL** 容器 `xuedda-mysql`：`127.0.0.1:3306` root/`xuedda_dev_pwd`。库 `xuedda`(新schema空) + `legacy`(旧dump全量, lz_download 4065行)。
  - 若没起：`cd /d/aliyun-site/xuedda-next && docker compose up -d`。docker CLI:`/c/Program Files/Docker/Docker/resources/bin/docker`。Docker曾因WSL旧报错，已`winget install Microsoft.WSL`修好。
- **封面图**：Windows junction `xuedda-next/public/uploads` → 旧站 `www.xuedda.com/uploads`（2万图），故 `/uploads/images/...` 直接可访问。
- `.env` 已建；`src/lib/db.ts` 用 `import.meta.env` 读取（不是 process.env）。
- ⚠️ **生产构建慢(~3分钟)**：junction 下 2万图被拷进 dist。迁 OSS 后解决，开发(`npm run dev`)无影响。
- ⚠️ **preview_screenshot 截图工具在本机带大图时超时**，验证改用 `curl` SSR HTML + `preview_eval` 查 DOM（可靠）。

---

## 4. 已完成（全站前端 + 真实数据）

### 数据访问层 `src/lib/content.ts`（关键：迁移时只改这里的 SQL）
- 现数据源 = `legacy.lz_download`（真实）。**迁移后把 SQL 里 `legacy.lz_download` 换成新表 `contents`**（字段已对应：image_url→cover_url, file_url→file_url, pass→extract_pass, money→price_money, create_time→created_at），其余逻辑不变。
- 函数：`getLatestDownloads` / `getHotDownloads` / `getDownloads({categoryId|categoryIds|rootCategoryId,q,sort,limit,offset})` / `countDownloads`(分页计数) / `getCategoryTree` / `getDownloadById` / `getRelated` / `getCategoryName` / `coverUrl()`。
- `DownloadItem` 含 `size`(来自 meta.file_size，旧库空) / 详情含 `autofill`(百度网盘 ?pwd= 自动填充提取码) / `meta.files[]`(一条资源多网盘文件)。
- `SECTIONS`：栏目 slug→{id,name,type}。`MODEL_GROUPS`：模型「智能分类」(建筑/室内空间/商业空间/家具单体/景观植物/D5专区) → 叶子分类 id 列表（因为旧库模型顶层是空壳，真实资源在~40叶子里，故手动归类）。

### 页面/路由（全部真实数据，已冒烟测试 200）
| 路由 | 文件 | 说明 |
|------|------|------|
| `/` | `pages/index.astro` | 首页：开场注册门槛+Hero轮播+软件入口(真logo)+SU模型(10)+热门榜+教学+材质+VIP横幅+软件。`prerender=false` |
| `/c/model` | `pages/c/model.astro` | **模型页(专用)**：顶部 **SU模型/MAX模型/文本** 三 tab；SU=智能分组**单侧栏**(MODEL_GROUPS)；MAX=分类162/212/321(17条真实)；文本=文案参考卡(静态)。搜索+排序+**分页**(每页30)。⚠️**布局约定：左侧只放一张「模型分类」卡，不要再加「全部栏目」卡**(用户嫌"一列特别多"，已于2026-06-18恢复单侧栏)。栏目切换走顶部全局导航。 |
| `/c/[slug]` | `pages/c/[slug].astro` | **通用栏目页**：texture/software/video/other/**qa/news**。分类树侧栏+搜索+排序+网格。 |
| `/d/[id]` | `pages/d/[id].astro` | 资源详情：大封面+价格/VIP+**返回按钮**+**内联下载面板**(点击不跳页，弹网盘链接+提取码+一键复制，百度网盘 ?pwd= 自动填充)+正文+相关推荐。 |
| `/search` | `pages/search.astro` | 全站标题搜索+排序。 |
| `/member/vip` `/member/login` `/member/register` | `pages/member/*` | VIP价格卡 / 登录 / 注册（**已接真实接口**，见 §4.5）。 |
| `/ai-image` `/feedback` `/ask` | `pages/*` | **AI生图工作台**(UI已完成，后端待接模型) / 反馈表单 / AI搜索。 |

### §4.6 AI 生图工作台 `/ai-image`（2026-06-18，UI 完成·后端占位）
- 参考「建筑学长」做的生图工作台：顶部**模式 tab**(文字生图/参考图生图/局部重绘/高清放大) + 中间**画布即拖拽区**(拖拽/粘贴/点击上传参考图，自适应高度 `clamp`) + 提示词框(带**示例提示词 chips** 一键填入) + 右侧**参数面板**(模型/画面比例/出图数量/风格预设 6 种建筑向/提交)。前端交互全可用，金色浅色设计系统。
- **后端占位** `src/pages/api/ai-image.ts`：参数已透传，现返回"接入中"友好提示。**接入时只改这一个文件**：校验登录(`verifySession`/member) → 扣积分(`members.integral`) → 调模型 → 返回 `{images:[url...]}`。
- **待用户定模型**：通义万相 / 即梦 / Flux / SD 等（文生图+图生图）。右上角剩余积分读 `/api/member/me`。
| `/admin/[...path]` | `pages/admin/`+`components/admin/*` | **后台 React SPA**（并行会话所建）：登录、内容CRUD、批量导入、媒体库、设置、AI 分析。受中间件鉴权。 |

### §4.5 会员鉴权 + 下载鉴权 + 安全（2026-06-18 体检后落地，**核心闭环**）
- **前台会员系统(真实)** `src/lib/member.ts` + `src/pages/api/member/{register,login,logout,me}.ts`：scrypt 密码 + HMAC 会话 cookie `xdd_member`。登录支持**懒迁移**——旧库 11.8 万会员用原密码(md5(md5))即可登录，成功后写入 `xuedda.members` 并升级 scrypt。
- **下载鉴权(真实)** `src/pages/api/download/[id].ts`：**网盘链接不再写进 HTML**；点击「立即下载」才请求接口，未登录→401(跳登录)，VIP 资源非会员→403(引导开通)，通过才下发链接+提取码。详情页 JS 处理三态。⚠️**这是付费站命门，别回退到把链接写进 SSR。**
- 前台表单(开场门槛/login/register)全接接口；顶栏登录后显示**用户名+退出**(`/api/member/me`)。
- **安全修复**：`SESSION_SECRET` 已设强随机(.env，生产务必保留)；详情正文 `set:html` 经 `sanitizeHtml()` 消毒(防存储型 XSS)；后台 API 由 `src/middleware.ts` 集中鉴权(verifySession)。SQL 全参数化/整数强转，无注入；无硬编码密钥(走 env)。
- **VIP 现状**：拦截已生效，但**会员如何变 VIP 还没有支付路径**(微信支付未接)——暂只能后台手动设 `members.level`。下载扣积分留 TODO。

### 设计系统 `src/styles/global.css`（手写）
- 移植自 `demo.html`：深色/浅色双主题 + 金色 `#c9963c`。容器 `--max-w:2040px`(用户要"宽一点")，`.container width:96%`。**栅格固定列**(`.grid-5=repeat(5,1fr)` 等，**不要改回 auto-fill**，否则宽屏"排满")。
- 卡片(.card) 封面/价格角标/meta/底部(类型+「下载」按钮，文案已统一)。⚠️旧库无文件大小字段，大小留待上传录入。

### `src/layouts/Base.astro`（应用外壳：左栏/顶栏/开场/抽屉/客服/JS）
- **App-shell 左侧导航 `.lnav`**(可收起)：首页/模型素材/灯光贴图/软件参数/视频教程/**AI生图(HOT,放大金色)**/**AI搜索(放大)**。`body.lnav-collapsed` 收起、左缘露重开手柄、状态存 localStorage(`xdd-lnav`)。`main/.footer { margin-left:188px }` 让位；顶部横向菜单(`.nav-main`)桌面隐藏。**原「今日上新」左浮窗已 `display:none`(与左栏重叠)。**
- **开场动画**：xDesign+太阳+词云+**注册/登录门槛**(已接 `/api/member/*`)；进入过(localStorage `xdd-entered`)不再拦。
- **三处"消息/公告"**：① 右上🔔铃铛 + ②「公告」按钮(`#announceBtn`) **都打开右侧滑出抽屉 `#noticeDrawer`**(三标签 版本/官方/互动，数据=`noticeTabs` 占位)；旧小弹卡 `.announce-pop` 已 `display:none`。③ 首页图片大弹窗 `promo`(年中大促，`public/announce.jpg`，本会话一次)。
- 顶栏：搜索框 + 移动端汉堡 + 登录态(用户名/退出)。右下角客服浮窗(二维码占位)。

### ✅ 体验(UX)修复(2026-06-18)
- 开场门槛只首页出现、本机进入一次不再拦；首页死链已接目标页；面包屑动态(按真实顶层栏目)；卡片按钮统一「下载」。

---

## 5. 接手后下一步（先问用户节奏）
1. **🔴 微信支付（上线唯一硬缺口）**：用户填商户凭证(`.env` 的 `WX_APP_ID/WX_MCH_ID/WX_API_KEY/WX_NOTIFY_URL`)后，做下单(NATIVE扫码/JSAPI/MWEB)+回调 `notify`(验签→升级 `members.level`+`vip_expire_at`/发激活码/记订单)。会员鉴权与下载拦截已就绪，支付一接 VIP 闭环即通。
2. **微信 OAuth 登录**(公众号 AppID/Secret)；下载扣积分(`/api/download/[id]` 有 TODO)。
2.5. **AI生图后端**(用户已定"先占位")：UI 全好，待用户给模型+key 后改 `src/pages/api/ai-image.ts`(校验登录→扣积分→调模型→返回图)。见 §4.6。
3. **正式数据迁移**(不急)：`db/migrate.mjs` 把 `legacy.lz_*` → `contents`；改 `content.ts` 查询为 `contents`；跑校验(封面存在+链接非空)。会员已支持登录懒迁移，可不批量迁。
4. **后台/上传方案**(等用户定，见 ADMIN_UPLOAD_PLAN)、Cloudflare DNS 接管上线。
5. 上线前务必：`.env` 的 `SESSION_SECRET` 保留强随机值；交付方案①/②先问用户(§2)。
6. 待办小项：列表翻页/加载更多(现每类30)；文件大小随上传录入；旧 settings 公告(默认关)可删。

## 6. 关键路径
| | |
|---|---|
| 新项目 | `D:\aliyun-site\xuedda-next\` |
| 页面 | `src/pages/`（index, c/model, c/[slug], d/[id], search, member/*, ai-image, feedback） |
| 布局/全局chrome | `src/layouts/Base.astro` |
| 数据层 | `src/lib/content.ts`（+ db.ts, types.ts, sample.ts备用） |
| 设计CSS | `src/styles/global.css` |
| 图/logo | `public/uploads`(junction), `public/img`, `public/hero`, `public/logos` |
| 新库schema | `db/schema.sql` |
| 设计参考 | `D:\ChatGpt\New project\xuedda-next\demo.html`（旧Next.js方案，含完整auth/admin可参考） |
| **前台设计/IA规范(技能)** | `D:\aliyun-site\.claude\skills\xuedda-frontend\SKILL.md`（改 UI/后台前必读） |
| **后台上传方案** | `D:\aliyun-site\ADMIN_UPLOAD_PLAN.md` + 记忆 `admin-architecture.md` |
| 旧站/架构/dump | `www.xuedda.com\`、`SITE_ARCHITECTURE.md`、`www_xuedda_com.sql` |

## 7. 记忆（`...\memory\`，接手后有新决策请同步）
- `xuedda-rebuild-decisions.md` — 总决策（技术栈/领域/口径）
- `admin-architecture.md` — 后台分离方案(方案B, React SPA+独立REST, 本地存储抽象层可切OSS)
- 索引见 `MEMORY.md`

---

## 8. 更新记录 CHANGELOG（⚠️ 每次改动都要在此追加，用户硬性要求）

> 倒序记录。每条：日期 + 改了什么 + 关键文件。

### 2026-06-26（后台大改 + 两个根因坑）
- **后台栏目管理表格同步前台模型分类逻辑**：`src/pages/admin/[...path].astro` 的「栏目树/栏目管理」不再直接平铺旧 PHP 原始模型树，新增 `categoryBoardRows()`，按前台整理后的三大模型分组输出「建筑 / 景观 / 室内」，并过滤掉旧模型树中间层（如工装/家装 SU 模型父级）避免后台继续混乱；非模型栏目放到「其他栏目」后面。表格增加分组标题行样式，栏目编辑、加子栏目、排序仍沿用原行操作。已跑 `npm run build` 通过。
- **模型栏目按三大类重排：建筑 / 景观 / 室内**：`src/lib/content.ts` 的 `MODEL_GROUPS` 从「室内 / 建筑 / 景观」改为「建筑 / 景观 / 室内」，前台 `/c/model` 模型侧栏标题同步为「建筑 / 景观 / 室内」，并给三大类加了更清晰的分组标题样式、计数胶囊和子栏目缩进；`src/pages/admin/[...path].astro` 后台上传/筛选用的 `DESIGN_CATEGORY_GROUPS` 同步改为相同顺序，保证后台选择栏目和前台筛选逻辑一致。已跑 `npm run build` 通过。
- **暗色主题高级感微调 + 客服浮窗改右侧居中可拖动**：`src/styles/global.css` 将暗色从冷黑紫调整为暖黑/细金/低饱和材质感，提亮正文与卡片文字，补强导航、搜索框、排行榜、资源卡片、图片占位和客服面板的暗色质感；`src/layouts/Base.astro` 的客服浮窗从右下角改为默认右侧居中，支持拖拽并用 `localStorage.xdd-cs-pos` 记住位置，拖动时不误打开面板，避免与底部网站公告重叠。已跑 `npm run build` 通过，并用 Chrome/Playwright 验证按钮默认位置、拖动保存和公告不相交。
- **网站公告改为底部贴边弹窗**：首页原正文流里的大横幅「网站公告」已删除，改为全站 `Base.astro` 底部浮层 `#siteNotice`。用户进入网站后会从浏览器底边浮起，点收起后缩成底部小标签，可再次展开；状态仅记在 `sessionStorage`，新会话会重新弹出。浮层避开左侧导航与右下客服，移动端改为底部整条。关键文件：`src/pages/index.astro`、`src/layouts/Base.astro`、`src/styles/global.css`。已跑 `npm run build` 通过，并确认首页包含 `#siteNotice`、旧正文公告段已移除。
- **灯光贴图新增 PSD 素材闭环**：通用栏目页 `/c/texture` 新增顶部页签「灯光贴图 / PSD素材」；普通灯光贴图查询会排除 `meta.model_format=PSD`，`/c/texture?format=psd` 只展示 `meta.model_format=PSD`，侧栏也按页签拆分，避免 PSD 混进普通贴图。注意普通灯光贴图不能强加 `asset_kind=texture`，因为旧库导入的老贴图资源大多没有该 meta。后台单条上传、批量上传、资源筛选、文件类型候选都补齐 `PSD素材`，选择 PSD 会自动归属到「灯光 / 贴图」并尽量切到本地旧栏目树 `灯光和贴图 / PSD素材`。上传接口资源白名单新增 `.psd/.psb`。本地 MySQL 已在 `legacy.lz_category` 下为 `parent_id=91` 补入 `PSD素材`（当前 id=369，生产库不要写死 id，按栏目名/父栏目识别）。关键文件：`src/pages/c/[slug].astro`、`src/lib/content.ts`、`src/pages/admin/[...path].astro`、`src/pages/api/admin/upload.ts`。已跑 `npm run build` 通过，并验证 `/c/texture`、`/c/texture?format=psd`、`/admin` 均 200。
- **拷贝 `google-labs-code/design.md` 并做产品自检修复**：已将 https://github.com/google-labs-code/design.md 作为 `xuedda-next/design.md/` 目录拉入当前项目，供后续沉淀设计系统使用。本轮从产品使用路径自检后，修复批量上传真实百度网盘多行文本（`通过网盘分享的文件...` / `链接 + 提取码` / `--来自百度网盘...`）被拆成多行的问题，改为按「每条链接一个资源块」解析；后台无表格行时的错误提示从“请先选择图片”改为“请先生成表格行”，避免无图导入场景误导。已验证 SU/MAX/分组/后台入口关键路由，`npm run build` 通过。
- **模型类型/分类/下载弹窗闭环修正**：前台 `/c/model` 的 SU 查询新增排除 `meta.model_format=MAX`，点击 SU 不再混入 MAX；MAX 查询继续按 `asset_kind=model + model_format=MAX`。模型侧栏和后台栏目选择器都收敛为 `室内 / 建筑 / 景观` 三组，组下再列旧库叶子栏目；后台搜索栏目时仍可搜全量旧栏目。下载弹窗改为显示 `链接地址` 与 `提取码` 两行，二者都可复制，打开链接只是辅助按钮，方便用户反馈失效链接。关键文件：`src/lib/content.ts`、`src/pages/c/model.astro`、`src/pages/admin/[...path].astro`、`src/layouts/Base.astro`、`src/styles/global.css`。已验证 SU 不含刚上传 MAX、MAX 含封面，`npm run build` 通过。
- **修复批量上传后前台 MAX 与封面闭环**：批量导入最终保存前会再次解析每行下载信息，防止整段百度网盘原文被写进 `file_url`；每行「类型」选 `MAX 模型` 时会反推 `meta.model_format=MAX`，不再被顶部默认 `SU` 覆盖；批量选图增加按扩展名识别图片，避免浏览器 `file.type` 为空导致封面被跳过。前台 `/c/model?type=max` 的「全部 MAX」改为按 `asset_kind=model + model_format=MAX` 展示，不再额外卡死在模型根栏目。已修正本地误导入的 4360-4363 四条数据（补链接、提取码、封面、MAX 类型），并确认页面包含标题与封面。关键文件：`src/pages/admin/[...path].astro`、`src/pages/c/model.astro`。已跑 `npm run build` 通过。
- **批量上传表格合并下载链接 + 提取码**：批量表格不再分开显示「百度网盘链接 / 提取码」两列，改为一列 `下载信息（粘贴整段百度网盘分享）`。在该格粘贴百度网盘原文（如 `通过网盘分享的文件：01.zip 链接: https://pan.baidu.com/s/... 提取码: 7a87 --来自百度网盘...`）会自动拆出干净下载链接、提取码，并优先把 `通过网盘分享的文件：...` 识别为资源名称；同样兼容 `pwd/pass/code/访问码/密码`。关键文件：`src/pages/admin/[...path].astro`。已跑 `npm run build` 通过。
- **批量上传改成 Excel 表格主流程**：去掉旧的 1/2/3/4/5 向导式大块，改为「顶部工具区 + 下方多列表格」。顶部工具区包含栏目搜索、批量选封面、TXT/粘贴百度网盘文本；表格列为 `名称 / 封面 / 百度网盘链接 / 提取码 / 大小 / 类型 / 显示 / 简介`。支持先粘贴百度网盘链接生成行，再按行号批量配图片；也支持先选图片再解析链接；解析支持 `简介/摘要/说明/描述` 字段；无图也可导入。关键文件：`src/pages/admin/[...path].astro`。已跑 `npm run build` 通过。
- **Codex 接手后台后的首轮小闭环**：批量上传面板补齐「资源归属 / 素材格式(SU/MAX/TEXT等) / 提取码显示隐藏」三个批量默认项，导入时写入 `meta.asset_kind`、`meta.model_format`、`meta.hide_extract_pass`，避免批量导入沿用单个上传抽屉的旧状态；后台上传接口资源附件白名单同步 UI，新增允许 `.txt/.doc/.docx`。关键文件：`src/pages/admin/[...path].astro`、`src/pages/api/admin/upload.ts`。已跑 `npm run build` 通过。
- **🔴🔴 根因 bug：Astro `<style>` 作用域 vs JS 动态元素**。后台 `[...path].astro` 的 `<style>` 被 Astro 加 `[data-astro-cid]` 作用域，**只对静态 HTML 生效**；后台栏目列表/批量表格全是 JS `createElement` 动态创建的，没有该属性 → 所有 CSS 类对动态内容**一律失效**（表现：栏目灰框、封面巨图、列不对齐）。**修复：`<style>` → `<style is:global>`**。⚠️ 以后改后台动态元素样式，记住 is:global 才生效，或直接内联 style。
- **🔴 协作：Codex 也在并行做前端**。`npm run dev`(4321) 是 Codex 的前端 HMR 服务器，dev 模式对这个巨型文件样式注入不可靠。**分工**：我=后台`[...path].astro`+`api/admin/*`+DB；Codex=前台`Base.astro`/`c/*`/`index`/`global.css`；共用`lib/content.ts|member.ts|db.ts|ratelimit.ts`(Codex 已重构成 `db`导出/`md5`from auth/`security`模块/`rateLimit`签名)。**看后台用生产构建端口(如 4322)，别用 4321 dev**。⚠️ 我改过 `c/model.astro`(前台分类同步)，属 Codex 地盘，可能冲突，待协调。
- **栏目树重设计**：真树形引导线 `├─└─│` + 父=琥珀文件夹/叶=灰标签图标 + 缩进，一级加粗。`renderCategories`/`flatCategories(加lasts/hasKids)`/`catRowIcon`。
- **用户管理日期筛选**：`api/admin/users.ts` 加 `date`+`field(login|register)` 范围查询；前端日期选择+今日/昨日快捷+「当日登录N人」统计。
- **内容筛选增强**：`api/admin/contents.ts` 加 `field`(全部/标题/关键词/简介搜索范围)+`format`(SU/MAX/D5..按model_format)+栏目筛选**含子孙**(选父栏目带出全部子资源,实测0→764)。
- **删除功能**：行内「删除」按钮 + 批量删除(都二次确认)；`contents.ts` PATCH 加 `delete` 动作。只删 xuedda.contents,不碰旧站/用户。
- **多选**：Shift 范围多选(按 id 算索引)、全选本页/取消选择、批量迁移栏目(专用「迁移到」下拉+确认)。
- **批量上传整体重做**：①可搜索栏目选择器(`renderBatchCatList`+路径提示,batchCategory 改隐藏input) ②全屏抽屉(批量与编辑抽屉分离,各自固定底栏保存) ③图片时间/自然序排序 ④粘贴/导入TXT「解析并配对」自动拆 标题/链接/提取码/大小 ⑤批量默认(统一命名前缀+序号/统一简介/显示状态) ⑥**Excel表格预览**(真`<table>`+**全内联样式**bxInput/bxTd,图片 HTML width/height 双保险,列:#|命名|封面|链接|提取码|类型|简介,每行类型下拉)。导入用每行 link/pass/size/fileType+summary+batchShow,sort 倒序(首图最前)。
- **前台模型页同步**：`c/model.astro` 筛选侧栏从写死 MODEL_GROUPS 改成实时读 `getCategoryTree(107)`(后台改栏目前台自动同步)。⚠️ 前台文件,与 Codex 协调。
- ⚠️ **Windows 坑**：`rm -rf dist` 卡 `dist/client/uploads` 的 junction(指向旧站2万图,删不掉)→ 只清 `dist/server`+`dist/client/_astro` 再 build；服务运行时 build 会锁 dist 致 chunk 损坏(启动报 `ERR_MODULE_NOT_FOUND`/`new URL(undefined)`)→ 先停 node 再 build；验证后台样式**拉外链 `_astro/*.css` 文件**,别 grep HTML(动态内容样式在JS里)。



### 2026-06-25（后台栏目树重设计 + 用户日期筛选）
- **栏目树重设计 v2**（后台 `[...path].astro`）：根/子层级分明、不再等大矩形。主栏目=分组标题感(min-h 36px/14px 粗/彩色 11px 方块 cat-chip/同组色着色计数/组间 6px 留白)；子栏目=27px/12.5px 灰/缩进 20px每级/`└` 连接符 cat-conn；全部资源=黑锚点 40px；0 淡显；选中金色。CSS(`.cat-node/.cat-root/.cat-sub/.cat-chip/.cat-conn`)+JS(`renderCategoryTree`)。⚠️ 后台 CSS/JS 现抽到外链 `_astro/*.css|js`，**验证要拉外链文件不是 grep HTML**；用户看旧样式=浏览器缓存，需 Ctrl+Shift+R 硬刷。
- **用户管理加日期筛选 + 每日登录**：`api/admin/users.ts` 加 `date=YYYY-MM-DD`&`field=login|register`（范围查询走索引）；后台工具栏加 日期选择+字段切换+今日/昨日/清除快捷钮+「当日登录/注册 N 人」统计条。SQL 逻辑已对真实数据验证（如 6-16 登录 47 人）。前端鉴权需登录实测。
- ⚠️ **Windows 部署坑**：服务运行中 `npm run build` 会锁 dist 致 manifest 损坏(启动报 `new URL('undefined')`)。**必须先停 node 再 build**。本机最终：清进程→`rm -rf dist`→build→`node dist/server/entry.mjs`，`/`+`/admin` 均 200。


### 2026-06-25（后台大改版：换肤 + 抽屉上传 + 用户管理 + 操作日志 + 链接扫描 + AI生图本地化 + 前台筛选局部刷新）
> ⚠️ 后台是**单文件巨型内联页** `src/pages/admin/[...path].astro`（HTML+CSS+原生JS 全在一个文件，JS 靠 class/id 绑定 —— 改样式安全，改结构需谨慎）。本轮全部改动均 dev(4321) curl + 脚本编译校验通过；**无后台账号未做真实 E2E**，接手者登录后台实测。
- **后台整体浅色极简换肤**：原深黑+金主题 → 白底极简（近黑 `#18181b` 主按钮、灰阶、金色仅做点缀）。只改 `<style>` 变量与硬编码深色规则，class/JS 未动。
- **资源管理列表**：①去掉封面大图（纯文字 Excel 行，加大行高+字号）；②**不暴露网盘链接**（无摘要时显示"已配置网盘链接"，不再泄露 file_url）；③加**翻页器** `renderContentPager`。
- **上传表单改右侧抽屉**：默认收起，点「批量上传/单个新增/编辑某行」才滑出（`.material-upload` 改 fixed drawer + `#drawerOverlay`），保存/隐藏后自动收起，Esc/遮罩关闭。`openDrawer/closeDrawer`。
- **批量上传重做 = 图+链接配对**：选多图 或 **选整个文件夹**(`webkitdirectory`) → 每图一行填「标题 + 网盘分享文本」(`parseShareText` 自动拆链接/提取码/大小) → **客户端压缩**(canvas，最长边 1600、JPEG ≤300KB) → 成对创建。`compressImage/renderBatchRows/addBatchFiles/batchImportResources`，`state.batchItems`。
- **素材栏目树重做**：①可折叠（默认只显顶层、`▸`展开/`▾`收起、**只有点到最末级叶子才筛选显示素材**，`state.expandedCats`）；②**每个主栏目分配一个颜色**（PALETTE 8 色循环），子栏目**继承同色**（左 4px 竖条 + 同色浅底），展开后整组一条色带，互相区分。`renderCategoryTree`。
- **用户管理（新模块·侧栏05）**：搜索/列表/翻页 + 详情抽屉（改**积分/会员等级/会员到期日** + **下载记录** + **最后登录时间**）。后端 `src/pages/api/admin/users.ts`(列表)、`src/pages/api/admin/users/[id].ts`(GET 详情含下载记录 + PATCH 改积分/level/exp)。**读写 `legacy.lz_member`**（11.8万），写操作仅单行 `WHERE id=? LIMIT 1`、只动 integral/level/exp_time、**绝不批量**。登录时间=`last_login_time`，下载记录=`legacy.lz_download_log` LEFT JOIN `legacy.lz_download` 取标题。
- **操作日志（新模块·侧栏06）**：`src/lib/adminlog.ts`（懒建 `xuedda.admin_log` 表 + `logAction` fail-safe，不影响主操作）、`src/pages/api/admin/logs.ts`（列表+翻页）。已插桩：`contents.ts` POST(create)、`content/[id].ts` PATCH(update)/DELETE(hide)，记录 时间/操作/对象标题/操作人(`locals.admin.name`)。
- **百度网盘链接扫描**：`src/pages/api/admin/scan-links.ts`（POST `{ids}` → 逐个 fetch、命中失效关键词判 dead、并发 5/超时 8s/单次≤60）。资源列表批量栏「扫描本页链接」按钮，行内打标 有效(绿)/失效(红)/未知(灰)，`state.linkStatus`。**尽力而为：百度反爬+JS渲染→不 100% 准，多为"未知"需人工复核；本地 dev 抓百度更受限，上国内服务器会准些。**
- **AI生图本地化**：`src/pages/ai-image.astro` 由占位页重写为**站内生图工作台**（提示词 + 比例 + 生成 + 实时秒数 + 结果 + 下载 + localStorage 历史 + 提示词快捷），`src/pages/api/ai-image/generate.ts`（移植出图逻辑：Vercel 代理 / OpenAI 兼容两路 + `pickImage` 解析；**无登录、完全开放**；未配 `IMAGE_PROXY_*` 时优雅 503 `NOT_CONFIGURED`）。⚠️ 这是薛大大站**自己的本地页**，与"AI生图外链 ai.belongstoai.com"(`Base.astro` 的 `ai_image_url` 设置)是两套——若仍走外链，外链优先级更高，本地页可作降级/备用。
- **前台筛选栏局部刷新**：`src/pages/c/model.astro` 加脚本——点子栏目/排序/翻页只 fetch 并替换右侧 `.mpage-main`，**左侧筛选栏不重载、滚动位置 + 页面位置都保留**（DOMParser 抽取 + `history.pushState`；卡片下载用 document 事件委托，换 innerHTML 不影响）。
- **本轮待办（接手继续）**：①操作日志暂只覆盖资源 create/update/hide——**批量操作 + 用户改积分未记日志**；②**自动按时间编序号 + 拖动调显示位置**（part3 剩余）未做；③新站下载未落库（`lz_download_log` 是历史数据，下载记录不含新站行为）——要补需在 `api/download/[id].ts` 写日志；④`c/[slug].astro`（灯光/软件/视频/其他分类页）局部刷新**未加**，同款待补；⑤AI生图后端未接 key（填 `.env` 的 `IMAGE_PROXY_VERCEL_URL` 或 `IMAGE_PROXY_BASE_URL`+`IMAGE_PROXY_API_KEY` 即通，无需改码）。
- **环境提醒**：env 走 `import.meta.env`；`NEXT_PUBLIC_` 不适用本项目（这是 Astro 不是 Next）；改后台/前端用 dev + curl 验证（构建慢 3-4min）；测 API 带浏览器 UA（middleware 拦 curl UA → 误导性 Access Denied）；后台 API 受 `middleware.ts` 鉴权（非 GET 还要过 CSRF，未登录 POST 返回 403）。

### 2026-06-23（AI生图接现成站 + 背景纯白 + 间距）
- **AI生图指向现成站**：薛大大站的「AI生图」(左栏/顶栏nav/顶栏cats 三处)外链到已上线的 `https://www.belongstoai.com/ai-image`（独立 Next.js+CF+Vercel 项目，见 `D:\ChatGpt\New project\xuedda-next\CLAUDE_HANDOFF_BELONGSTOAI_AI_IMAGE.md`）。通过后台设置 `xuedda.settings.ai_image_url` 配置（已写入），`Base.astro` 用 `aiImageUrl||'/ai-image'`+external。顶栏「模型素材」左侧也新增了 AI生图。
- **背景改纯白**：浅色主题 `--bg-base` 米色→`#fff`，`--bg-elevated`→`#f4f4f6`，nav 半透明白，边框柔化；hero 渐变底部硬编码米色→白。
- **版块间距收紧 + 去分割线**：`.section` padding 50/42→28/24，删 `.section+.section` 的 border-top 分割横线，section-head 间距 26→18。
- **决策：测试站不上线真实登录数据**：本机 11.8 万真实用户(`legacy.lz_member`)不对 belongstoai.com 测试站公开。部署实例需改连「空的/测试 member 表」(净新注册)——此步未做，是接手后首件要和用户敲定的事。详见 `HANDOFF-接手-2026-06-23.md` 第 5 节。
- **写了换号交接文档** `D:\aliyun-site\HANDOFF-接手-2026-06-23.md`（自包含全局状态+决策+待办，供下一个账号接手）。
- **部署方案 A 定案**：薛大大站=belongstoai.com 主站（本机 Node+现有 Docker MySQL 11.8万用户，经 cloudflared 隧道暴露）；AI生图站搬到 ai.belongstoai.com(CF Pages 改绑域名)。AI生图链接(`ai_image_url`设置)→`https://ai.belongstoai.com`。物料：`deploy/cloudflared-config.yml`、`deploy/DEPLOY-belongstoai.md`、`deploy/ecosystem.config.cjs`。cloudflared 登录/CF 绑定由用户执行。本机方案命门=电脑/Docker/隧道三者常开，长期稳定需迁阿里云。

### 2026-06-23（左侧栏改分组式）
- **左侧导航改站酷式分组**：从平铺 8 项改为「首页(单列) + 资源素材组(模型/灯光/软件/视频) + AI工具组(搜索/AI生图/AI问答)」，加组标题(带图标)+子项缩进。AI 项去掉重渐变/放大，改为仅金色图标点缀，融入分组。只重组现有功能、无新增。`Base.astro`(lnavGroups 数据结构+渲染) + `global.css`(.lnav-group/.lnav-group-title/.lnav-item.sub)。

### 2026-06-23（后台缺口分析 + 闭环修复第一步）
- **决策**：并行月新站只做 浏览+上传+下载；会员/支付/签到/积分继续走旧站（共享 lz_member）。后台待补：会员管理、下载记录、留言反馈、栏目管理、站点设置（+用户提到一项"Something else"待澄清）。部署方式暂缓。
- **闭环修复(第一步,隐藏并行期归旧站的死按钮)**：移除 ①首页登录框「微信登录」②顶栏+移动菜单+会员页「收藏」入口/tab ③详情页「收藏」按钮。`Base.astro`、`d/[id].astro`、`member/index.astro`。(`iaWechat` JS 用了 `?.` 不会报错；vip 页"微信支付即将上线"是说明文字非死按钮，保留)
- ⏳ 下一轮：建「下载记录(/api/download 落库 + 会员中心展示)」「留言反馈(/feedback 表单 action=# 是死的→接 xuedda.feedback)」「会员管理」「栏目管理」「站点设置」。

### 2026-06-23（首页/文案微调）
- **隐藏资源总量**：去掉 `/ask` 副标题「站内 4000+ 资源」（以后不对外透露库存数量）。搜索结果「找到 N 条」是当次匹配数，保留。
- **热门下载榜上移**：首页版块顺序改为 热门下载榜(HOT RANKING) → 每日最近上传(SU MODEL) → 课程 → 材质 → 软件（`index.astro`）。

### 2026-06-23（搜索改造）
- **砍掉 AI 搜索，改回关键字搜索**：`/ask` 页重写为服务端渲染的关键字搜索（去掉 `/api/ai-search` 调用与 AI 回答框）；导航 `AI搜索→搜索`、搜索框 placeholder 改文案。
- **搜索优化（多列+多词）**：`content.ts buildDownloadWhere` 的 q 从「只 `title LIKE`」改为「按空格拆词，每词需在 `title/summary/keywords` 任一命中，多词 AND 收窄」。实测 茶室 26、会所 4(原2)、廊架 37、`新中式 茶室` 9。`/search` 同样受益。

### 2026-06-23（并行上线准备）
- **🔴 用户表改为与旧站共用 `legacy.lz_member`**（11.8万用户）：决策=并行期新旧站共用一张用户表、双向通用不串号。`member.ts` 全量重写：登录/注册/VIP/积分全部读写 `legacy.lz_member`，密码沿用旧站 `md5(md5(pwd))` 格式（新站注册的号旧站也能登，已 E2E 验证：注册→登录→/me 通过，密码 = md5(md5) = 旧站格式，测试数据已清理，lz_member 仍精确 118300 行）。旧站下线后再迁 scrypt。
- **🔴 后台登录改用旧站 `legacy.lz_admin`**：复用旧管理员（xuedda、guanyukai）。注意旧站**管理员是单重 md5**(`md5(pwd)`)，与会员双重 md5 不同，`api/admin/login.ts` 已按单重校验。
- **注册页去掉英文标语** `stolen light, given freely`（`Base.astro` intro-sub）。
- **新增「旧版」切换入口**：`.env` 设 `OLD_SITE_URL` 即在顶栏显示「旧版 ↗」，留空不显示（`Base.astro` + `.site-switch` 样式 + `.env.example`）。
- **数据核查**：legacy 库完整(lz_member 118300、积分日志 95.7万、签到 83万、订单 2万、下载 4075)；xuedda.members/admins 现已不再使用（改走 legacy）。
- ⚠️ 仍需你做：1) 旧站怎么和新站在同机并行(端口/子域)；2) 大陆服务器 Claude 不通→接国产视觉模型(通义VL)；3) 封面迁 OSS。

### 2026-06-21
- **卡片新增大小 + 可自定义资源类型**：footer 左下角显示文件大小(`m.size`，空则「-- MB」)，右侧类型标签改为后台可自定义——新增 `meta.file_type`(后台「资源类型」字段，带 SKP/MAX/Rhino/C4D… datalist 建议)，前台 `m.fileType || 栏目默认`。链路：`content.ts`(DownloadItem.fileType ← meta.file_type)、`api/admin/content/index.ts`(buildContentRow 写 file_type，PUT/POST 共用)、`ContentForm.tsx`(新增字段+回填+payload)、各卡片模板 footer 改 `card-size`+`card-foot-r`、`global.css`(download-footer 改 space-between，新增 .card-size/.card-foot-r)。
- **资源卡片版式重做**：去掉日期/浏览量/下载量(`card-meta`)，标题下新增模型简介 `card-desc`(取 `summary`，空则「暂无简介」，2 行截断)，保留左上角「免费」标签与下载按钮；收紧留白：`.grid-5` 改 `align-items:start`(按内容自然高度，不再拉伸等高把按钮顶到底)、`card-desc` 去 `flex:1` 加 `min-height:2.4em`、`card-body` padding 略收。涉及 `index.astro`、`c/[slug].astro`、`c/model.astro`、`search.astro`、`d/[id].astro`、`global.css`。注：约半数旧资源 summary 为空，显示占位。
- **🔴 安全加固（全盘审计后）**：①新增内存限流 `lib/ratelimit.ts`（固定窗口+IP，取 x-forwarded-for）；②管理员/会员登录各 15 分钟 10 次、注册 1 小时 5 次防爆破；③公开 AI 搜索 `/api/ai-search` 加限流(每分钟 8 次)+输入截断 200 字，防刷量烧 token；④`member.ts verifyMember` 改 `timingSafeEqual` 恒定时间比签名(原 `!==` 有时序侧信道)。涉及 `lib/ratelimit.ts`(新)、`api/admin/login.ts`、`api/member/login.ts`、`api/member/register.ts`、`api/ai-search.ts`、`lib/member.ts`。审计结论见 HANDOFF 第 9 节。
- **全站资源卡片统一「免费」+ 软件资源改一行五个**：所有列表卡片左上角角标 `priceLabel` 一律返回「免费」（不再区分 VIP/价格）；首页「软件资源」「薛大大教学(课程)」版块 `grid-4` → `grid-5`（首页四大版块统一一行五个）。涉及 `index.astro`、`c/[slug].astro`、`c/model.astro`、`search.astro`、`ask.astro`。详情页 `d/[id].astro` 的价格/下载逻辑未动。

### 2026-06-28
- **线上安全+体检审查**（只读，未改线上）：① 应用层安全审查——会话/OAuth/验证码/找回密码/下载白名单/IDOR/限流/XSS 全部达标。② 服务器层发现 MySQL 3306 与宝塔 22732 **对公网暴露**（走阿里云安全组关）、CentOS 7 EOL、PM2 以 root 跑。③ 线上体检发现**旧 PHP SEO 链接全失效**(`/index/download/show/id/*.html` 等被 Google 收录却 404/502)、robots.txt 404 + sitemap 502、部署期 502、缺安全头。→ 优化清单产出 `OPTIMIZE-LIVE-2026-06-28.md`（发 Codex 修复）。④ 服务器约 7G 冗余备份/日志可清（用户暂缓）。

### 2026-06-18
- **数据库优雅降级**：`content.ts` 的 `loadChildren/getCategoryTree/getRootCategory/getCategoryName` 加 try/catch（之前直接 query 无保护，MySQL 抖动就整页 500）。现在 DB 临时不可用→渲染空版块而非 500；loadChildren 失败不缓存空表，下次自动重试。**注意：MySQL 在用户机器上容易随 Docker Desktop 关闭而断**，首页报 `ECONNREFUSED 3306` 时先 `docker start xuedda-mysql`。
- **卡片「下载」直接弹窗（不跳详情）接通**：给全部「下载」按钮加 `data-dl` 标记，触发已有的全局下载弹窗 JS（`Base.astro` 370 行起，监听 `[data-dl]`→阻止跳转→调 `/api/download` 弹网盘链接+提取码，处理 401/403）。`index/c-model/c-[slug]/d-[id]` 共 6 处。模型分栏（建筑/室内/景观 3 大类 + 各自小类 `<details>`）确认在线生效。
- **环境**：Docker Desktop 曾被关导致 MySQL 断、首页 500（非代码问题）；重启 Docker 引擎+`xuedda-mysql` 后恢复。dev server 跑在 `http://localhost:4321/`。
- **顶栏重叠修复 + Logo + VIP 位置**：隐藏冗余浮动「公告」(`.announce-wrap display:none`，与铃铛重复且压住"退出"；公告统一走铃铛/抽屉)；登录名只显示 @ 前缀(长邮箱挤压元凶)；**Logo 改 `XDesign · 薛大大生态设计`**；首页 **VIP 横幅移到「常用工具入口」与「每日最近上传」之间**（原在材质后），按钮接 `/member/vip`。`Base.astro`、`global.css`、`index.astro`
- **AI 生图页深色重设计**：从浅色平铺改为主流生图站深色高级感（局部覆盖 token 强制深色、发光画布+网格遮罩、渐变金标题、分段式 mode、生成按钮金渐变发光、风格卡顶部渐变条）。结构/JS 未动。`pages/ai-image.astro`
- **模型分类改「3 大类 + 各自小类」**：建筑/室内/景观三大类，每类用 `<details>` 折叠展开其叶子小类（默认展开当前类）；MAX 仍为软件/渲染器/插件/模型扁平。`pages/c/model.astro` + `lib/content.ts(MODEL_GROUPS/MAX_GROUPS)`
- **会员中心 `/member`**：下载记录/收藏/账户三标签（记录功能待"下载日志"），顶栏「收藏/下载记录」指向此。`pages/member/index.astro`、`Base.astro`
- **AI问答入口** `/chat`（占位，待接 Cloudflare 多模型对话）；左栏 AI 项放大金色。`Base.astro`、`pages/chat.astro`
- **Logo 改 xDesign**（顶栏，金色 Design）；**全局顶部偏移修复**（`main{padding-top:58px}`，子页面不再压在固定导航下、logo 不压 hero）；内容加宽 `--max-w:2040`。`Base.astro`、`global.css`
- **公告+铃铛都开右侧消息抽屉**（`#noticeDrawer` 三标签）；旧小弹卡停用。**首页图片大弹窗 `promo`**。`Base.astro`
- **App-shell 左侧可收起导航 `.lnav`**（首页/模型素材/灯光贴图/软件参数/视频教程/AI生图/AI搜索/AI问答），`body.lnav-collapsed` 收起+localStorage 记忆；原「今日上新」浮窗隐藏。
- **🔴 安全/闭环修复**：前台会员鉴权(`lib/member.ts`+`/api/member/*`，scrypt+HMAC，旧库懒迁移)；**下载鉴权 `/api/download/[id]`**(链接不入 HTML，未登录401/非VIP403)；`SESSION_SECRET` 强随机；详情正文 `sanitizeHtml` 消毒。
- 栅格固定 5 列（防宽屏"排满"）；面包屑动态(顶层栏目)；卡片按钮统一「下载」。

### ⏳ 本轮未完成（下次继续）
- **卡片「下载」按钮直接弹窗给网盘链接**（不跳详情）——全局下载弹窗 + 卡片 `data-dl` 委托点击，调 `/api/download` 三态。**未做。**
- **留言板**：`/api/feedback`(公开提交) + `/admin/messages.astro`(仅管理员可见，静态路由胜过 SPA catch-all) + `/feedback` 表单接接口。**未做。**

## 9. 安全审计结论（2026-06-21 全盘扫描）

### ✅ 现状良好
- SQL 全参数化；`getDownloads` 的 `order` 走白名单、`limit/offset` 夹取数字、分类 id 经 `Number.isInteger` 过滤——无注入面。
- `.env` 已 gitignore，`SESSION_SECRET` 64 位强随机；密码 scrypt + 旧库 md5 懒迁移。
- 会话 token HMAC-SHA256 签名 + 过期校验；cookie 全 `HttpOnly; SameSite=Lax`（天然挡掉大部分 CSRF）。
- `/api/admin/*` 由 middleware 统一鉴权（登录接口除外）；下载接口校验登录+VIP。
- 本地存储 `delete` 有越界保护；`/api/admin/img.ts?url=` 限定 uploads 目录。

### ✅ 本轮已修
- 登录/注册/AI 搜索全部加 IP 限流；AI 搜索输入截断；`verifyMember` 恒定时间比较。（详见第 8 节）

### ⚠️ 待办（未自动改，需你拍板）
1. **`/api/admin/img.ts` 的 `?folder=&file=` 分支可读任意本地文件**（`path.join(folder, basename(file))`，folder 不受限）。仅管理员可达（middleware 保护），风险中低；批量扫描功能依赖它读任意源文件夹。建议：限定到白名单根目录，或确认仅可信管理员使用即可。
2. **`sanitizeHtml` 是正则版**（详情正文 `set:html`）。内容为管理员录入，风险低；但正则消毒可被构造绕过。建议长期换成 `sanitize-html`/DOMPurify(SSR) 之类成熟库。
3. **限流是单机内存版**：将来多实例/PM2 cluster 部署会各算各的，需换 Redis。
4. **`x-forwarded-for` 信任问题**：限流取 XFF 首段，须确保 Nginx 反代会覆盖客户端伪造的该头（`proxy_set_header X-Forwarded-For $remote_addr` 或用 `$proxy_add_x_forwarded_for`），否则可被伪造绕过限流。

### 💡 功能/体验建议（非安全）
- **下载日志/积分**：`/api/download/[id]` 里有 TODO，目前下载不记录、不扣积分。接「会员中心-下载记录」需要它落库。
- **收藏功能**：详情页/卡片「收藏」按钮目前是死的，无后端。
- **AI 生图 `/api/ai-image`**：仍是占位返回，未接模型。
- **留言板/反馈**：`/feedback` 表单未接后端（见第 8 节未完成项）。
- **会员/me 等公开接口**也建议补限流（防遍历）。
### 2026-06-23（belongstoai.com 简化部署：根页面 + 生图子页）
- 用户纠正部署目标：不再迁移 xuedda 域名，也不再单独做 AI 生图子域；只把当前新页面放到 `belongstoai.com/`，原 AI 生图保留为 `belongstoai.com/ai-image` 子页面。
- `D:\aliyun-site\xuedda-next\src\layouts\Base.astro`：导航里的「AI生图」固定指向内部 `/ai-image`，不再读取旧的 `settings.ai_image_url` 外链配置，避免跳到外部项目或旧域名。
- `D:\aliyun-site\xuedda-next\deploy\cloudflared-config.yml`：重写为清晰版 Cloudflare Tunnel 配置，root/www 都转发到本机 Astro `localhost:4321`；说明 `/ai-image` 是同站子页。
- `D:\aliyun-site\xuedda-next\deploy\DEPLOY-belongstoai.md`：重写部署说明，明确 `belongstoai.com/` 是首页，`/ai-image` 是生图页，Cloudflare 后台需移除 root/www 旧 Pages/Vercel 绑定冲突。
