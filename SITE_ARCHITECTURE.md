# xuedda.com — 网站架构文档

> 生成时间: 2026-06-17
> 目标读者: Claude / Codex (AI 重建用)
> **阅读顺序**: 从头到尾，每一节都可能是重建的关键信息。

---

## 1. 项目总览

| 项目 | 说明 |
|------|------|
| **名称** | 学大大 (xuedda.com) |
| **类型** | 内容管理系统 (CMS) + 会员付费系统 |
| **CMS 名称** | LZ-CMS v1.1.4 (老张内容管理系统) |
| **基础框架** | ThinkPHP 5.0.3 (2016) |
| **语言** | PHP 5.6 |
| **数据库** | MySQL (127.0.0.1:3306, 库名 `www_xuedda_com`) |
| **Web 服务器** | Nginx (宝塔面板), 兼容 Apache / IIS |
| **缓存/Session** | Redis |
| **支付** | 微信支付 (NATIVE / JSAPI / MWEB) |
| **文件数量** | ~24,000 文件 (其中 22,000+ 是上传的 jpg 图片) |
| **代码文件** | 632 个 .php 文件 |

---

## 2. 技术栈一览

```
后端:      PHP 5.6 + ThinkPHP 5.0.3 + Composer
数据库:    MySQL 5.x, 表前缀 lz_
缓存:      Redis (prefix: x_)
Session:   Redis
前端:      LayUI 2.x + jQuery 3.2.1 + Swiper 4.2.6 + 百度 UMEditor + 百度 WebUploader
模板:      ThinkPHP 原生模板引擎 ({include...} {volist...} {:url()})
构建:      无 (传统 PHP 项目，JS/CSS 直接通过 <script>/<link> 引入)
部署:      宝塔面板 (BT Panel) on Linux
```

**Composer 依赖** (来自 `composer.json`):
- `topthink/framework: ^5.0` (核心框架)
- `topthink/think-image: ^1.0` (图片处理)
- `topthink/think-captcha: ^1.0` (验证码)
- 自定义扩展: `extend/PHPExcel/` (Excel 导入导出), `extend/wxpay/` (微信支付 SDK)

---

## 3. 目录结构

```
www.xuedda.com/
├── index.php                    # ★ 入口文件 (定义 LZ_VERSION, APP_PATH)
├── think                        # CLI 入口 (php think ...)
├── router.php                   # PHP 内置开发服务器路由
├── composer.json / composer.lock
├── .htaccess                    # Apache URL 重写
├── web.config                   # IIS URL 重写 + 301 重定向 (xuedda.com → www)
├── httpd.ini                    # IIS ISAPI 重写
├── .user.ini                    # open_basedir 限制
├── Sitemap.xml / robots.txt
│
├── thinkphp/                    # ThinkPHP 5.0.3 框架核心
│   └── library/think/
│
├── application/                 # ★ 应用代码 (MVC)
│   ├── config.php               # 全局配置 (模块、URL、模板、缓存、Session)
│   ├── database.php             # 数据库连接 (⚠ 含明文密码)
│   ├── route.php                # 路由 (全部被注释，未启用)
│   ├── tags.php                 # 行为钩子 (全部为空)
│   ├── common.php               # ★ 全局公共函数 (261行)
│   ├── command.php              # 命令行注册 (为空)
│   ├── 404.html / 401.html
│   ├── install.lock             # 安装锁定文件
│   │
│   ├── index/                   # ★ 前台模块
│   │   ├── config.php           # 覆盖: view_path=./template/laozhang/, suffix=.html
│   │   └── controller/          # 16个控制器
│   │       ├── Init.php         # 基类 (加载设置、分类、会员)
│   │       ├── Index.php        # 首页
│   │       ├── Article.php      # 文章
│   │       ├── Picture.php      # 图集
│   │       ├── Video.php        # 视频
│   │       ├── Download.php     # 下载
│   │       ├── Course.php       # 课程 (含章节)
│   │       ├── Mp4.php          # MP4视频
│   │       ├── Question.php     # 问答
│   │       ├── Page.php         # 单页
│   │       ├── Member.php       # ★★ 会员中心 (844行，最复杂)
│   │       ├── Feedback.php     # 留言
│   │       ├── Link.php         # 友链
│   │       └── Search.php       # 搜索
│   │
│   ├── admin/                   # ★ 后台模块
│   │   ├── controller/          # 22个控制器 (对应所有内容类型 + 系统管理)
│   │   ├── model/               # 2个模型 (Admin, Asset)
│   │   └── view/                # 21个子目录 (.tpl.php 模板)
│   │
│   ├── common/                  # ★ 公共模块 (跨前台/后台共享)
│   │   └── model/               # 30个模型文件 (数据层核心)
│   │       ├── Category.php     # ★★ 分类模型 (371行，最复杂)
│   │       ├── Member.php, Order.php, Weixin.php
│   │       ├── Article.php, Picture.php, Video.php, Download.php
│   │       ├── Course.php, CourseChapter.php, Mp4.php
│   │       ├── Question.php, Page.php, Link.php, Feedback.php
│   │       ├── Focus.php, Setting.php, Code.php
│   │       ├── IntegralLog.php, DownloadLog.php, Sign.php
│   │       └── IndexTheme.php, IndexType.php, IndexTypeCategory.php
│   │
│   └── install/                 # ★ 安装向导
│       └── sql/
│           ├── table.sql        # 建表语句
│           └── data.sql         # 初始数据
│
├── template/laozhang/           # ★ 前台模板 (主题: laozhang)
│   ├── public/
│   │   ├── header.html          # 公共头部 (554行, 含导航/搜索/移动菜单)
│   │   ├── footer.html          # 公共底部 (789行, 含登录弹窗/注册弹窗/签到)
│   │   ├── breadcrumb.html      # 面包屑
│   │   └── qrcode.html          # 二维码弹窗
│   ├── index/index.html         # ★ 首页 (Swiper轮播+主题+分类卡片+弹窗)
│   ├── article/                 # index.html, list.html, show.html
│   ├── course/                  # index.html, list.html, show.html, type.html
│   ├── download/                # index/list/show/type/theme/star_list/pay_list/dynamic_list
│   ├── mp4/                     # index.html, list.html, show.html
│   ├── picture/                 # index.html, list.html, show.html
│   ├── question/                # index.html, list.html, show.html
│   ├── video/                   # index.html, list.html
│   ├── member/                  # 登录/注册/微信登录/VIP开通/订单
│   ├── feedback/index.html
│   ├── page/index.html
│   ├── search/search.html
│   ├── link/list.html
│   └── static/                  # 主题静态资源 (CSS/JS/字体/图片)
│       ├── css/
│       ├── js/ (jquery, swiper, lazyload, share, qrcode)
│       └── font/
│
├── static/                      # 全局静态资源
│   ├── layui/                   # LayUI 2.x 完整框架
│   ├── umeditor/                # 百度UMEditor 富文本编辑器
│   ├── webuploader/             # 百度WebUploader 上传组件
│   ├── css/, js/, images/
│   └── font/, icons/
│
├── uploads/                     # ★ 用户上传文件 (22,000+ 图片)
│   ├── images/                  # 按日期子目录存放
│   ├── layedit/                 # 富文本上传图片
│   └── umeditor/                # 编辑器上传图片
│
├── vendor/                      # Composer vendor
│   └── topthink/
│       ├── think-image/
│       ├── think-captcha/
│       └── think-installer/
│
└── extend/                      # 自定义扩展
    ├── PHPExcel/                # Excel 导入导出
    └── wxpay/                   # 微信支付 SDK
```

---

## 4. 请求生命周期

```
1. Nginx 接收请求 → URL 重写 → index.php
2. index.php → 定义 LZ_VERSION, APP_PATH → require thinkphp/start.php
3. ThinkPHP 框架启动 → 加载 config.php, database.php, tags.php, common.php
4. 路由解析 (默认: /模块/控制器/方法)
5. 前台: index 模块, 后台: admin 模块
6. 控制器基类 Init.php:
   - 检查 install.lock 是否存在
   - Redis 加载 site settings (lz_setting 表)
   - Redis 加载分类树 (lz_category)
   - Redis 加载模型列表 (lz_model)
   - 初始化 Session 会员信息
   - 将 settings/categorys/models 注入所有视图
7. 控制器调用 common/model/ 做 CRUD
8. 视图渲染: 前台用 template/laozhang/*.html, 后台用 admin/view/*.tpl.php
9. 模板引擎: ThinkPHP 原生 ({include}, {volist}, {if}, {:url()})
```

---

## 5. 数据库完整结构 (31张表)

### 5.1 内容模型表 (Content Models)

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `lz_article` | 文章 | category_id, title, content, image_url, hits, is_recommend, is_top |
| `lz_picture` | 图集 | category_id, title, images(json), content, hits |
| `lz_video` | 视频 | category_id, title, file_url, hits, download_num |
| `lz_download` | 下载资源 | category_id, title, file_url, integral, money, just_vip, pass, type_id, theme_id |
| `lz_course` | 课程 | category_id, title, author, period, money, expire_type, status(完结/更新中), type_id |
| `lz_mp4` | MP4视频 | category_id, title, video_url, download_url, integral, just_vip |
| `lz_question` | 问答 | category_id, title, content, hits |
| `lz_page` | 单页 | category_id, title, content (单页面，无列表) |
| `lz_link` | 友链 | category_id, title, url, image_url |

**所有内容模型共性字段**: `id`, `category_id`, `title`, `image_url`, `create_time`, `hits`, `is_top`, `is_recommend`, `is_show`, `sort`, `url`, `keywords`

### 5.2 课程扩展表

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `lz_course_chapter` | 课程章节/课时 | c_id(course.id), name(章), title(课时), file_url(视频), trial_type(试看) |

章节采用**两级结构**: `parent=0` 为章(章节), `parent!=0` 为该章下的课时。

### 5.3 分类与模型

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `lz_category` | 内容分类 (无限级) | parent_id, model_id, name, index_template, list_template, show_template, url, is_menu, is_cover |
| `lz_model` | 内容模型注册 | name, tablename, index_template, list_template, show_template |

**分类-模型关系**: `lz_category.model_id` → `lz_model.id`, 每个分类绑定一个内容模型, 决定该分类下使用哪个表存储数据。

### 5.4 会员系统

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `lz_member` | 会员 | level(0普通/1月卡/2季卡/3年卡), exp_time, openid, integral, user_name, password, user_type(1QQ/2微信) |
| `lz_member_course` | 会员购买的课程 | user_id, course_id, expire_time |
| `lz_sign` | 签到记录 | member_id, sign_time, create_time |

### 5.5 支付与订单

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `lz_order` | 订单 | sn, product, code_types_id, real_amount, paid_amount, member_id, status, otype(1vip/2激活码) |
| `lz_code` | 激活码 | code, code_types_id, status(0未使用/1已使用), uid, sn(订单号) |
| `lz_jihuo_code_types` | 激活码类型 | code_type_name, origin_price, vip_price |

### 5.6 日志与行为

| 表名 | 用途 |
|------|------|
| `lz_download_log` | 下载记录 (model, data_id, member_id) |
| `lz_dynamic_log` | 动态资源下载记录 |
| `lz_integral_log` | 积分变动日志 |
| `lz_star_log` | 收藏日志 (model, data_id, member_id) |

### 5.7 系统表

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `lz_admin` | 管理员 | username, password(MD5), name, avatar |
| `lz_setting` | 站点配置 (KV对) | key(pk), value(text) |
| `lz_focus` | 首页轮播/Banner | type, title, image_url, video_url, url |
| `lz_feedback` | 留言板 | member_id, title, content, reply, reply_time |
| `lz_asset` | 上传文件管理 | user_id, filename, file_path, file_md5, suffix, file_size |
| `lz_index_theme` | 首页专题 | name, image_url, sort |
| `lz_index_type` | 首页内容分类 | name, sort, model_id(5=下载/9=课程) |
| `lz_index_type_category` | 首页分类-栏目关联 | type_id, category_id |
| `lz_posts` | WordPress 文章 (遗留) | 标准 wp_posts 结构 |

### 5.8 表引擎分布

- **InnoDB** (23张): 主要业务表 (article, course, download, member, order, code, feedback 等)
- **MyISAM** (8张): category, model, setting, integral_log, sign, order, question, code (比较老的或纯配置类表)

---

## 6. 数据关系图 (ER 概要)

```
lz_model (模型注册)
  │
  └──1:N── lz_category (分类, 绑定模型)
              │
              └──1:N── lz_article / lz_picture / lz_video / lz_download / lz_course / lz_mp4 / lz_question / lz_page / lz_link
                          │
                          └──N:M── lz_member (通过 lz_member_course, lz_download_log, lz_star_log, lz_integral_log)

lz_course ──1:N── lz_course_chapter (章节树, parent字段递归)

lz_jihuo_code_types ──1:N── lz_code (激活码)
lz_order (订单) → lz_member + lz_jihuo_code_types

lz_index_type ──1:N── lz_index_type_category ──N:1── lz_category
lz_download.type_id → lz_index_type.id (首页分类聚合)
lz_download.theme_id → lz_index_theme.id (首页专题聚合)
```

---

## 7. 前台控制器详解

### 7.1 Init.php (基类)

所有前台控制器继承此类。在 `_initialize()` 钩子中:
1. 检查 `application/install.lock` 是否存在
2. 从 Redis 加载 settings, categorys, models
3. 初始化 Session 会员 (默认 id=0)
4. 检查 `site_status`, 若为 0 则显示关闭页面
5. 注入公共变量到模板

### 7.2 Index.php (首页)

- `index()`: 构建首页数据
  - 获取 focus(Banner), link, index_theme, index_type
  - 为每个 index_type 加载对应栏目和内容
  - 下载类 (model_id=5) 和课程类 (model_id=9) 分组展示
- `getIndexTypeHtml()`: AJAX 接口, 按类型/分类过滤并返回 HTML 卡片

### 7.3 Article.php / Picture.php / Video.php 等 (内容控制器)

统一的 CRUD 模式 (每个 60-120 行):
- `index()`: 分类列表页(含子分类, SEO, 面包屑, 分页, 推荐/热门)
- `lists()`: 直接列表(无封面)
- `show()`: 详情页(SEO, 上下篇, 点击+1)
- `hits()`: AJAX 点击计数

### 7.4 Member.php (会员中心 ★★★ 最复杂)

844行。核心功能:

```
登录方式:
  1. 微信登录: OAuth2 跳转 open.weixin.qq.com → 获取 openid → 创建/绑定会员
  2. QQ登录: do_other_login() 类似OAuth流程
  3. 账号登录: user_name + password (md5(md5(pwd)))

注册:
  - 用户名 + 密码 + 验证码
  - 密码存储: md5(md5($password))  ⚠ 极不安全

支付流程:
  1. create_order(): 购买 VIP (月卡/季卡/年卡)
  2. create_order_zhy(): 购买激活码
  3. create_order_course(): 购买课程
  4. 微信支付: Weixin model 生成支付链接
     - NATIVE: PC 端扫码支付 (返回 QR code URL)
     - JSAPI: 微信内支付
     - MWEB: 手机浏览器 H5 支付
  5. notify(): 支付回调
     - 验证签名
     - 更新订单状态
     - 升级会员 level/exp_time
     - 分配激活码
     - 添加课程购买记录

签到:
  - do_sign(): 每日签到 + 积分
  - 连续签到 7 天: 积分翻倍 (double_points)

VIP 等级:
  - 0 = 普通会员
  - 1 = 月卡会员 (30天)
  - 2 = 季卡/半年卡会员 (180天)
  - 3 = 年卡会员 (365天)
```

---

## 8. 后台控制器详解

### 8.1 基类 Init.php

检查 `admin_user` session, 无则跳转 login。从缓存加载 settings。

### 8.2 Login.php

验证码校验 → `model('admin')->do_login($params)` → 写入 session。

### 8.3 所有后台控制器

统一命名, 每个控制器都有:
- `index()`: 列表页
- `add()`: 添加页
- `edit()`: 编辑页
- `delete()` / `batches()`: 删除/批量操作

**后台完整控制器列表**: Index, Login, Init, Admin, Article, Picture, Video, Download, Course, Mp4, Question, Page, Feedback, Link, Member, Category, Cache, Setting, Focus, Theme, Asset, Upload

---

## 9. 公共模型层 (common/model/)

### 9.1 Category.php ★★★ (371行)

最复杂的模型, 负责:
- 分类树构建: `get_tree()` / `get_level_category()`
- 缓存管理: `cache_category()` 写入 Redis
- 面包屑: `get_position()`
- 模板解析: `get_templates()` 按 model 解析模板文件
- URL 生成: `get_url()` 按 category.url 或 id 生成
- 后台树: `get_admin_tree()`

### 9.2 Weixin.php (263行)

微信支付 SDK 封装:
- `get_pay_url()`: 生成 NATIVE/JSAPI/MWEB 支付链接
- `getqrcode()`: 生成扫码支付二维码
- `_notify()`: 支付回调验证

### 9.3 其他模型模式

大部分模型遵循统一模式:
```php
class Xxx {
    public function add($data)     // 新增
    public function edit($data)    // 编辑
    public function batches($data) // 批量操作(删除/移动)
    public function get_list($params)  // 列表分页
    public function get_details($id)   // 详情(含SEO/上下篇/URL)
}
```

---

## 10. 模板系统

### 10.1 前台模板 (template/laozhang/)

**模板引擎**: ThinkPHP 内置模板引擎, 后缀 `.html`
**模板标签**:
```
{include file="public/header" /}           # 包含模板
{volist name="list" id="vo"} ... {/volist} # 循环
{if condition="..."} ... {else /} ... {/if} # 条件
{:url('index/article/show', ['id'=>$vo.id])} # URL生成
{$settings.copy}                           # 输出变量
```

**模板渲染方式**: 全部服务端渲染 (SSR), 无前后端分离。首页的部分内容通过 AJAX (`getIndexTypeHtml`) 动态加载 HTML 片段。

**移动适配**: `isMobile()` 函数 (userAgent + 屏幕宽度检测), 不同设备显示不同的导航布局。

### 10.2 后台模板 (application/admin/view/)

模板后缀 `.tpl.php`, 使用 ThinkPHP 模板引擎。每个控制器对应一个子目录, 内含 `list.tpl.php`, `add.tpl.php`, `edit.tpl.php` 等标准 CRUD 视图。

**后台UI框架**: LayUI 2.x (tree, form, element, laypage, laydate, upload, code 等模块)

---

## 11. 全局公共函数 (common.php)

| 函数名 | 用途 |
|--------|------|
| `random($len, $num)` | 生成随机字符串 |
| `thumb($src, $w, $h)` | 图片缩略图 (使用 think-image) |
| `delDir($dir)` | 递归删除目录 |
| `array_sort($arr, $keys, $type)` | 二维数组排序 |
| `format_datetime($time, $type)` | 相对时间格式化 ("刚刚", "X分钟前", "X小时前", "昨天") |
| `is_ssl()` | 检测 HTTPS |
| `xmlToArray($xml)` / `arrayToXml($arr)` | XML ↔ 数组转换 |
| `member_level()` | 返回会员等级数组 |
| `is_star($id)` | 检查当前会员是否收藏某资源 |
| `removeEmojiAndSpecialChars($str)` | 过滤 emoji 和特殊字符 |
| `getAllSubCategories($pid, $cats)` | 递归获取子分类 (过滤 is_menu==1) |

---

## 12. 服务器配置要点

### 12.1 Nginx (宝塔面板生成)

```
监听: 80 + 443 (SSL HTTP/2)
域名: www.xuedda.com, test.xuedda.com, *.xuedda.com, xuedda.com
HTTP → HTTPS 强制跳转
PHP: PHP 5.6 (enable-php-56.conf)
禁止访问: .user.ini, .htaccess, .git, .env, .svn
静态缓存: 图片 30天, JS/CSS 12小时
```

### 12.2 URL 重写规则

Apache/IIS/Nginx 统一规则: 所有非文件/非目录请求 → `index.php` (ThinkPHP pathinfo 模式)

### 12.3 IIS 额外规则

`xuedda.com` → `www.xuedda.com` 301 重定向

### 12.4 SSL

Let's Encrypt 证书 (`.well-known/acme-challenge/` 目录存在), HSTS max-age=31536000

---

## 13. 路径映射表 (URL → 控制器)

| URL 模式 | 控制器/方法 |
|----------|------------|
| `/` | index/index/index |
| `/article/:category_id` | index/article/index (分类封面) |
| `/article/:id.html` | index/article/show (文章详情) |
| `/picture/:category_id` | index/picture/index |
| `/download/:category_id` | index/download/index |
| `/course/:category_id` | index/course/index |
| `/course/type/:type_id` | index/course/type |
| `/mp4/:category_id` | index/mp4/index |
| `/question/:category_id` | index/question/index |
| `/video/:category_id` | index/video/index |
| `/page/:category_id` | index/page/index |
| `/link` | index/link/index |
| `/feedback` | index/feedback/index |
| `/search` | index/search/search |
| `/member` | index/member/member_index |
| `/member/login` | index/member/login |
| `/member/register` | index/member/register |
| `/member/open_vip` | index/member/open_vip |
| `/member/create_order` | index/member/create_order |
| `/member/notify` | index/member/notify (支付回调) |
| `/admin` | admin/index/index |
| `/admin/login` | admin/login/index |
| `/admin/:controller/:action` | admin/:controller/:action |

---

## 14. 安全注意事项 ⚠

1. **数据库密码明文**: `application/database.php` 含明文密码, 部署时需移除
2. **会员密码弱加密**: 仅 `md5(md5($password))`, 未加 salt, 极不安全
3. **管理员密码**: 同样仅 MD5, 未加盐
4. **PHP 5.6**: 已 EOL, 存在安全风险
5. **ThinkPHP 5.0.3**: 2016 年版本, 已知漏洞
6. **Redis 无密码**: config.php 中 Redis 配置无密码字段
7. **微信支付 Key**: 可能存在于 config 文件或 Weixin model 中 (需重建时重新配置)
8. **调试信息**: admin/Index.php 有 `test()` 方法遗留, 内含外部 HTTP 请求

---

## 15. 关键配置常量与变量

| 常量/变量 | 定义位置 | 值 |
|-----------|---------|-----|
| `LZ_VERSION` | index.php | v1.1.4 |
| `APP_PATH` | index.php | `__DIR__ . '/application/'` |
| `default_module` | config.php | `index` |
| `url_html_suffix` | config.php | `html` |
| `cache.prefix` | config.php | `x_` |
| `paginate.list_rows` | config.php | 15 |
| `database` | database.php | `www_xuedda_com` @ 127.0.0.1 |
| `prefix` (table) | database.php | `lz_` |
| `template.view_path` | index/config.php | `./template/laozhang/` |
| `template.view_suffix` | index/config.php | `html` |

---

## 16. 重建建议

### 推荐方案: Go + 现代前端

1. **数据库**: 31 张表可高度精简合并。核心内容表(article/picture/video/download/course/mp4/question) 字段高度相似, 可统一为 `contents` 表 + 类型字段 + JSON 扩展字段
2. **分类系统**: `category` 表 + `model` 表可简化
3. **会员/支付**: member + order + code 保留
4. **API 化**: 原 SSR 模板改为 RESTful API + 前端 SPA
5. **静态资源**: uploads/ 中的 22,000+ 图片需迁移到对象存储 (OSS/S3/R2)
6. **模板重写**: 原模板标签 `{include}`, `{volist}` 替换为 Vue/React 组件

### 数据库精简方向

```
31张表 → 约15张核心表:
├── contents (合并 article+picture+video+download+course+mp4+question+page+link)
├── categories (原 category)
├── models (原 model, 可选)
├── content_meta (扩展字段, JSON)
├── course_chapters (保留)
├── members (保留)
├── member_courses (保留)
├── orders (保留, 合并 code 表逻辑)
├── admin_users (保留)
├── settings (保留 KV)
├── focus (Banner, 保留)
├── feedback (保留)
├── logs (合并 download_log + integral_log + star_log)
├── index_types / index_themes (可选简化)
└── assets (文件管理)
```

---

## 17. 文件清单 (快速查找)

| 用途 | 路径 |
|------|------|
| 入口文件 | `www.xuedda.com/index.php` |
| 框架核心 | `www.xuedda.com/thinkphp/` |
| 全局配置 | `www.xuedda.com/application/config.php` |
| 数据库配置 | `www.xuedda.com/application/database.php` |
| 路由配置 | `www.xuedda.com/application/route.php` |
| 公共函数 | `www.xuedda.com/application/common.php` |
| 前台控制器基类 | `www.xuedda.com/application/index/controller/Init.php` |
| 首页控制器 | `www.xuedda.com/application/index/controller/Index.php` |
| 会员控制器 | `www.xuedda.com/application/index/controller/Member.php` |
| 分类模型 | `www.xuedda.com/application/common/model/Category.php` |
| 微信支付模型 | `www.xuedda.com/application/common/model/Weixin.php` |
| 前台模板目录 | `www.xuedda.com/template/laozhang/` |
| 公共头部 | `www.xuedda.com/template/laozhang/public/header.html` |
| 公共底部 | `www.xuedda.com/template/laozhang/public/footer.html` |
| 后台模板 | `www.xuedda.com/application/admin/view/` |
| 上传文件 | `www.xuedda.com/uploads/images/` |
| 数据库备份 | `www.xuedda_com.sql` |
| Nginx 配置 | `www.xuedda.com.conf` |
| 安装SQL | `www.xuedda.com/application/install/sql/` |

---

> **总评**: 这是一个典型的 2016-2018 年中文 PHP CMS 站点, 技术栈老旧但功能完整。核心是内容管理 + 会员付费 + 微信生态。重建时建议保留数据结构和业务逻辑, 用现代技术栈重写表现层和应用层。
