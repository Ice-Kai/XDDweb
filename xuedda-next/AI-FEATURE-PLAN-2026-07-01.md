# XDesign AI 功能规划 - 2026-07-01

## 最新目标

用户希望开始正式做 AI 功能，产品方向参考 Lovart，但不是照搬界面，而是学习它的核心产品结构：

- 设计 Agent 工作台
- 对话式输入
- 画布式结果区
- 上传参考图 / 改图 / 继续生成
- 本地历史记录
- 设计场景模板
- 后续接入计费、限额和会员体系

参考站点：

- https://www.lovart.ai/zh

## 当前项目现状

当前主项目：

```text
D:\aliyun-site\xuedda-next
```

现有 AI 相关文件：

```text
src/pages/ai-image.astro
src/pages/api/ai-image/generate.ts
src/pages/ask.astro
src/pages/chat.astro
```

问题：

- `src/pages/ai-image.astro` 目前是早期静态壳，文案存在乱码，不适合作为正式 AI 产品继续堆。
- `src/pages/api/ai-image/generate.ts` 已经有生图代理雏形，但错误文案也有乱码，需要重写。
- 当前导航里的 AI 生图被置灰，说明正式入口还没有开放。

旧 AI 项目：

```text
D:\ChatGpt\New project\xuedda-next
D:\ChatGpt\New project\belongstoai-image-proxy
```

旧项目里已有较完整 AI 功能：

```text
src/app/ai-image/page.tsx
src/components/ai-image/image-generator-composer.tsx
src/components/ai-image/image-editor.tsx
src/components/ai-image/request-image.ts
src/app/api/ai-image/generate/route.ts
src/app/api/ai-image/comfy-wash/route.ts
```

代理项目：

```text
D:\ChatGpt\New project\belongstoai-image-proxy\api\generate.js
D:\ChatGpt\New project\belongstoai-image-proxy\api\chat.js
D:\ChatGpt\New project\belongstoai-image-proxy\api\wash.js
```

## 推荐架构

不要把 Lovart 式 AI 工作台硬塞进当前素材站普通页面里。

推荐：

```text
xuedda.com                 -> Astro 素材站
xuedda.com/ai              -> AI 工作台入口
xuedda.com/ai-image        -> AI 生图工作台
/api/ai-image/generate     -> 生图 API
/api/ai-image/wash         -> 4K 洗图 API
```

实现方式可以分两阶段：

1. 短期：在当前 Astro 项目内重做 `/ai-image` 页面，先实现 Lovart 风格 MVP。
2. 中期：把旧 Next.js AI 工作台独立部署成一个 AI 服务，用 Nginx 反代到 `xuedda.com/ai-image`，素材站和 AI 工作台共享登录 Cookie / 数据库。

如果要最快落地，优先采用第 1 阶段。

## MVP 功能清单

第一版不要做太重，先做用户能真正用的闭环。

### 1. AI 工作台页面

核心布局：

- 左侧：工具栏
- 中间：画布 / 结果区
- 右侧：对话面板
- 底部或右侧：提示词输入区

必要功能：

- 输入提示词
- 选择比例：1:1 / 16:9 / 9:16 / 4:3 / 3:4
- 生成图片
- 显示生成进度
- 显示结果图
- 下载结果图
- 保存本地历史

### 2. 上传参考图

第一版先支持：

- 上传 1 张主参考图
- 生成时作为参考图发送给后端
- 允许继续基于当前图改图

第二版再支持：

- 多参考图
- 局部涂抹
- 遮罩编辑

### 3. 设计模板

先按设计站用户常用场景做，不要泛泛而谈：

- 室内效果图
- 建筑外观
- 景观空间
- 材质贴图
- 电商主图
- 海报封面
- IP 角色
- 产品摄影

点击模板后自动填入提示词结构。

### 4. 历史记录

短期：

- 保存到浏览器 IndexedDB
- 不上传用户生成图到服务器

中期：

- 登录用户可选择保存到云端
- 后台可查看任务计费和失败率，不直接公开用户私图

### 5. 额度与计费

短期测试：

- 登录后可用
- 每个用户每天限制生成次数
- 管理员账号可绕过限制

中期商业化：

- 积分 / 次数扣费
- 失败不扣费
- 任务日志记录 provider、耗时、状态、错误类型

## 后端接口建议

### POST /api/ai-image/generate

请求：

```json
{
  "prompt": "生成一张现代客厅效果图...",
  "ratio": "16:9",
  "provider": "gpt",
  "quality": "standard",
  "inputImage": "data:image/jpeg;base64,...",
  "referenceImages": []
}
```

返回：

```json
{
  "ok": true,
  "image": "data:image/png;base64,...",
  "taskId": null,
  "cost": 1
}
```

### POST /api/ai-image/wash

用于 4K 洗图 / 高清修复。

### GET /api/ai-image/usage

返回用户今日额度、剩余次数、是否管理员。

## 旧项目可复用部分

建议优先复用：

- `image-generator-composer.tsx` 的交互思路
- `image-editor.tsx` 的画布编辑能力
- `local-image-history.ts` 的 IndexedDB 历史记录
- `belongstoai-image-proxy/api/generate.js` 的多 provider 代理逻辑

不要直接复用：

- 已乱码的中文文案
- 旧的 Cloudflare async task 包装逻辑
- 旧的 Gemini 主入口
- 旧的散乱公告编辑逻辑

## Lovart 对标要点

可以学习：

- 把 AI 做成“工作台”，不是一个表单。
- 用对话方式让用户连续提出修改。
- 画布区始终占主视觉。
- 结果可以继续编辑、继续生成、继续扩展。
- 模板不是分类列表，而是创作入口。

不要照搬：

- 品牌视觉
- 商业文案
- 具体页面结构和素材

## 建议下一步

第一阶段先做：

1. 重写当前 `src/pages/ai-image.astro`，修复乱码，做成正式工作台。
2. 重写 `src/pages/api/ai-image/generate.ts` 文案和错误处理。
3. 接入旧 `belongstoai-image-proxy`，优先跑通文字生图。
4. 导航里取消 AI 生图置灰，但加“测试中”标识。
5. 登录用户才能生成，游客可以看页面但点击生成提示登录。
6. 本地历史记录用 IndexedDB，不先进数据库。

第二阶段再做：

1. 上传参考图。
2. 继续改图。
3. 4K 洗图。
4. 积分扣费。
5. 任务日志和失败率统计。

