---
name: xuedda-frontend
description: 薛大大设计网的前台设计系统与信息架构，以及「后台上传如何贴合前台逻辑」的规范。Use when 设计或修改前台页面、后台/admin UI、上传表单、或任何需要与前台视觉/栏目结构保持一致的工作。
---

# 薛大大设计网 · 前台设计系统 & 后台对齐规范

薛大大设计网 = SketchUp/D5/Enscape/Lumion 等**建筑·室内·景观设计**的付费资源下载站。
**核心原则：后台是"前台的录入端"。后台 UI 用前台同一套设计语言，上传表单的字段/分类结构必须与前台展示一一对应**——编辑在后台填什么，前台就长什么样。

## 1. 设计 Token（唯一真源：`xuedda-next/src/styles/global.css` 的 `:root` / `[data-theme]`）

新建/改 UI 一律**复用 CSS 变量**，不要硬编码颜色。关键 token：

| 用途 | 变量 | 深色值 |
|---|---|---|
| 页面底 | `--bg-base` | `#0e0e14` |
| 卡片面 | `--bg-card` | `#15151e` |
| 升起面/输入底 | `--bg-elevated` | `#1c1c28` |
| 边框 | `--border` | `#222232` |
| 主文字/次/弱 | `--text-hi/md/lo` | `#ebe9e4` / `#a8a8be` / `#5c5c78` |
| **品牌金** | `--gold` `--gold-light` `--gold-pale` `--gold-border` | `#c9963c` … |
| 圆角 | `--radius` `--radius-sm` | `9px` / `5px` |
| 阴影 | `--shadow-card` `--shadow-hover` | … |
| 字体 | `--font-base` `--font-mono` | 微软雅黑系 |
| 容器 | `.container` = `width:96%;max-width:2200px` |

**后台固定深色**（`data-theme="dark"`）。金色用于：主按钮、激活态、价格、强调标签。

## 2. 复用前台组件类（已在 global.css 定义，后台可直接套）

- `.btn-primary`（金底主按钮）、`.btn-dl`（金描边小按钮）、`.card` + `.card-img-wrap`/`.card-cat`/`.card-body`/`.card-meta`/`.card-footer`（资源卡，16:10 封面）
- `.filter-card`/`.filter-nav`/`.filter-link`（左侧分类树，模型页智能归类用的就是它）
- `.mtab`（SU/MAX 这种分段 tab）、`.sort-btn`（排序）、`.toolbar`（搜索+排序条）
- 价格角标语义：`免费` / `¥xx` / `VIP`；分类色 `.cat-arch/.cat-inter/.cat-land/.cat-d5/.cat-mat`

## 3. 前台信息架构（后台分类/栏目必须照此）

**唯一真源：`xuedda-next/src/lib/content.ts`** 的 `SECTIONS` 与 `MODEL_GROUPS`。后台 `/api/admin/sections` 直接复用它们，**不要在后台另立一套分类**。

- **栏目 SECTIONS**：模型(model,107) / 灯光和贴图(texture,91) / 软件和参数(software,88) / 视频教程(video,89,课程) / 问答整理(qa,44) / 薛大大新闻(news,2) / 其他相关(other,339)
- **模型栏目特殊**：前台分 **SU模型 / MAX模型 / 文本** 三 tab。
  - SU = **智能归类 MODEL_GROUPS**（建筑/室内空间/商业空间/家具单体/景观植物/D5专区）→ 各自叶子分类 id（因旧库模型顶层是空壳，真实资源在 ~40 叶子里，手动归类）。
  - MAX = 分类 162/212/321 子树。
- 其他栏目 = 各自的 `lz_category` 子树。
- **路由映射**：栏目页 `/c/[slug]`、模型页 `/c/model`、详情 `/d/[id]`。后台编辑入口 `/admin/content/new?id=`。

## 4. 内容字段 → 前台展示 的对应（上传表单据此设计）

资源数据落 `xuedda.contents`（迁移后前台从这查）。字段 → 前台位置：

| 后台字段 | 前台展示位置 |
|---|---|
| `cover_url` | 卡片/详情大图（16:10） |
| `title` | 卡片标题 / 详情标题 |
| `price_money` / `just_vip` | 卡片角标 + 详情价格区（`免费`/`¥`/`VIP`） |
| `file_url` + `extract_pass` | 详情「立即下载」(百度网盘) + 提取码 |
| `meta.files[]` | 一条资源多个网盘文件（SKP/MAX/贴图分开） |
| `summary` / `body` | 详情摘要 / 正文 |
| `category_id` + `meta.category_ids` | 决定出现在哪个栏目/智能归类下 |
| `sort` | 列表排序（大在前） |
| `hits` / `download_num` | 卡片 meta（浏览/下载） |
| `is_show` / `is_recommend` | 是否前台可见 / 首页精选 |

⚠️ 旧库无「文件大小」字段(filename全空)，大小靠上传时录入（`meta.files[].fileSize`）。

## 5. 后台上传贴合前台的硬性要求（做 UI 时核对）

1. **分类选择器 = 前台导航形态**：栏目按钮行 → 模型再出 SU/MAX 子 tab + 智能归类 chips；其他栏目出分类树。组件 `SectionPicker.tsx`，数据来自 `/api/admin/sections`。
2. **所见即所得**：上传表单右侧应有卡片预览，按前台 `.card` 渲染封面+标题+价格角标，让编辑看到"前台长这样"。
3. **批量入库**：面向 4000+ 资源，支持读文件夹自动排序 + 配网盘链接（`/admin/batch`）。
4. **视觉一致**：后台所有页面引入 `global.css`，复用上面的变量与组件类，金色#c9963c 主色，深色面，微软雅黑。

## 6. 不要做的

- 不要 AI 生成配图（用户自己加）。
- 首页不展示统计数字（资源数/会员数都不放在前台）。
- 不要在后台另造一套分类/配色，一切以 `content.ts` + `global.css` 为准。
- 品牌名暂用「薛大大设计网」。

> 改完用 `curl` SSR + DOM 验证（本机截图工具带大图会超时）。
