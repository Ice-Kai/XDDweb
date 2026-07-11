# 手机端 UI 接手说明 - 2026-06-29

本文件给下一位接手者（Claude / Codex / 其他 agent）快速理解当前素材站手机端适配方案。当前只在本地修改，尚未推 GitHub，也未部署线上。

## 当前结论

手机端已经做了第一版可用适配：

- 真实手机访问时，按屏幕宽度自动进入手机 UI。
- 电脑端顶部有 `手机适配` 按钮，点击后可强制把页面收成约 430px 手机预览宽度。
- 强制手机模式会写入 `localStorage`，刷新后保留；再点 `退出手机` 可恢复桌面模式。
- 真实手机端隐藏 `手机适配` 按钮，因为手机本身已经自动适配，避免顶部过挤。

## 关键文件

### 1. `src/layouts/Base.astro`

主要改动：

- 顶部导航增加 `#viewportModeBtn`，用于电脑端手动切换手机预览。
- 增加 `#mobileDrawer` 手机端抽屉导航。
- 增加 `.mobile-tabbar` 手机端底部导航。
- 修改 `#navBurger`，手机端点击打开抽屉，而不是旧的桌面 nav 展开。
- 退出登录绑定改为 `.nav-logout` 批量绑定，手机抽屉里的退出也能工作。
- 脚本中新增 `xdd-ui-mode`：

```js
const key = 'xdd-ui-mode';
root.setAttribute('data-ui-mode', next);
```

模式含义：

- `data-ui-mode="auto"`：默认状态，按 CSS 媒体查询自动适配。
- `data-ui-mode="mobile"`：电脑端强制手机预览。

### 2. `src/styles/global.css`

主要改动：

- `.mobile-drawer` / `.mobile-tabbar` 默认隐藏。
- `@media (max-width:760px)`：真实手机端样式。
- `@media (min-width:761px) html[data-ui-mode="mobile"]`：电脑端强制手机预览样式。
- 手机端隐藏桌面左侧栏：

```css
.lnav,
.lnav-reopen {
  display:none !important;
}
```

- 手机端底部导航固定在底部。
- 手机端公告压缩成贴近底部的小条，避免挡住页面主体。
- 手机端客服浮窗固定在页面右侧中部附近，并避免被历史拖动坐标带飞。

### 3. `src/lib/content.ts`

本地测试时发现数据库缺 `lz_category` 会导致页面 500。已加容错：

- `getDescendantIds`
- `getCategoryTree`
- `getSiteStats`

如果本地库缺 `lz_category`，前台降级为空栏目，不让页面崩。线上真实库有表时会正常读取栏目。

## 手机端当前体验

### 顶部栏

手机端顶部保留：

- `XDesign` logo
- 搜索框
- 汉堡菜单
- 深浅色切换

隐藏：

- 桌面 P3 横向栏目
- 会员中心 / 下载记录 / 反馈等文字链接
- 字号调节
- 消息铃铛
- 手机适配按钮

### 抽屉菜单

点击汉堡菜单打开右侧抽屉，包含：

- 搜索
- 资源入口：AI生图、模型素材、灯光贴图、软件参数、视频教程
- 分类快捷：模型分组、MAX、灯光贴图、软件参数
- 账号入口：登录 / 注册，登录后显示会员中心 / 退出登录

### 底部导航

手机端底部固定 5 项：

- 首页
- 模型
- 贴图
- 搜索
- 登录 / 我的

### 列表页

`/c/model` 等栏目页手机端改为：

- 桌面左侧分类栏变成页面上方分类卡片。
- 分类卡高度限制为 230px，可滚动。
- 资源卡片默认两列，小屏再收成一列。
- 搜索、排序控件改为上下排列，避免挤压。

## 验证记录

已本地验证：

```bash
npm run build
```

结果：通过。

浏览器验证：

- 桌面宽屏默认：`data-ui-mode="auto"`，页面保持桌面版。
- 点击 `手机适配`：页面宽度收成约 430px，底部导航显示，左侧栏隐藏。
- 再点击 `退出手机`：恢复桌面版。
- 真实 390px 手机视口：无横向溢出，底部导航显示，顶部不挤。

测试过的本地地址：

```text
http://127.0.0.1:4321/
http://127.0.0.1:4321/c/model
```

## 已知问题 / 后续建议

1. 当前手机端是第一版通用适配，重点保证能用、不卡、无横向溢出。后续可以逐页做更精细设计。
2. 强制手机模式主要给电脑端预览用，不是真正的 device emulation，不会改 user-agent。
3. 如果后续继续优化，优先处理：
   - 首页 Hero 在手机端标题略大，可再收细一点。
   - 资源卡片两列在 390px 下可用，但如果素材标题更长，可能需要进一步缩短描述。
   - 分类卡目前是 230px 高滚动，后续可做“展开全部 / 收起”按钮。
4. 不建议把手机端样式拆到单独 CSS 文件，当前 `Base.astro + global.css` 已经集中管理全站导航和公共布局，拆开容易漏样式。
5. 修改手机端时务必同时验证：
   - `/`
   - `/c/model`
   - `/c/texture`
   - `/member`
   - 登录/退出流程

## 不要踩的坑

- 不要只改 `@media (max-width:760px)`。电脑端的 `手机适配` 依赖 `html[data-ui-mode="mobile"]` 那一组 CSS。
- 不要在手机端显示 `#viewportModeBtn`，真实手机本来就自动适配，显示后顶部会拥挤。
- 不要把 `.mobile-tabbar` 默认设为 `display:grid`，否则桌面会出现手机底栏。
- 不要删除 `localStorage` 的 `xdd-ui-mode` 逻辑，否则电脑端无法记住用户选择。
- 本地数据库可能没有 `lz_category`，不要把 `content.ts` 的降级容错删掉，否则本地页面会 500。

## 交接给 Claude 时的建议提示词

可以直接给 Claude：

```text
请先阅读 MOBILE-UI-HANDOFF-2026-06-29.md。
当前项目是 Astro 素材站，手机端已有第一版适配：
真实手机走 @media(max-width:760px)，电脑端手动手机预览走 html[data-ui-mode="mobile"]。
请不要删除 xdd-ui-mode、mobileDrawer、mobile-tabbar，也不要把手机适配按钮显示在真实手机端。
接下来只做局部体验优化，并用 npm run build 和移动端视口验证。
```

