-- xuedda.com 新数据库 schema (重建版)
-- 目标: MySQL 8 / utf8mb4 / InnoDB
-- 原 31 张 lz_ 表精简为 ~14 张。前缀去除，统一蛇形命名。
-- 设计要点: 以「付费下载资源」为核心，8 种内容类型合并进 contents 表 + type 区分 + meta JSON。
-- 注意: 这是新结构的目标定义；旧数据通过 db/migrate.mjs 迁入(待重启装好 MySQL 后运行)。

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ─────────────────────────────────────────────────────────────
-- 分类 (原 lz_category, ~148 行; lz_model 合并为 content_type 字符串)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `categories` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `parent_id`     INT UNSIGNED NOT NULL DEFAULT 0,
  `content_type`  VARCHAR(20)  NOT NULL DEFAULT 'download'  COMMENT 'download/article/mp4/question/course/picture/video/page/link',
  `name`          VARCHAR(100) NOT NULL,
  `slug`          VARCHAR(120) NOT NULL DEFAULT ''           COMMENT 'URL 友好别名, 替代旧 category.url',
  `description`   VARCHAR(500) NOT NULL DEFAULT '',
  `cover_url`     VARCHAR(500) NOT NULL DEFAULT '',
  `keywords`      VARCHAR(255) NOT NULL DEFAULT '',
  `is_menu`       TINYINT      NOT NULL DEFAULT 1            COMMENT '是否显示在导航',
  `sort`          INT          NOT NULL DEFAULT 0,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_parent` (`parent_id`),
  KEY `idx_type` (`content_type`),
  UNIQUE KEY `uk_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- 内容 (合并 download/article/mp4/question/picture/video/page/link)
-- 课程因结构特殊单列。download 是主力 (~4064 行)。
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `contents` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `type`          VARCHAR(20)  NOT NULL DEFAULT 'download',
  `category_id`   INT UNSIGNED NOT NULL DEFAULT 0,
  `title`         VARCHAR(255) NOT NULL,
  `slug`          VARCHAR(255) NOT NULL DEFAULT '',
  `summary`       VARCHAR(500) NOT NULL DEFAULT '',
  `cover_url`     VARCHAR(500) NOT NULL DEFAULT '',
  `body`          LONGTEXT         NULL                      COMMENT '正文/富文本',
  `keywords`      VARCHAR(255) NOT NULL DEFAULT '',
  -- 付费/下载相关 (download/mp4 用)
  `file_url`      VARCHAR(700) NOT NULL DEFAULT ''           COMMENT '下载/资源地址(迁移后指向 OSS)',
  `extract_pass`  VARCHAR(100) NOT NULL DEFAULT ''           COMMENT '解压/提取密码(原 pass)',
  `price_integral` INT         NOT NULL DEFAULT 0            COMMENT '积分价(原 integral)',
  `price_money`   DECIMAL(10,2) NOT NULL DEFAULT 0.00        COMMENT '现金价(原 money)',
  `just_vip`      TINYINT      NOT NULL DEFAULT 0            COMMENT '是否仅 VIP 可下载',
  -- 首页聚合 (原 download.type_id / theme_id)
  `index_type_id` INT UNSIGNED NOT NULL DEFAULT 0,
  `index_theme_id` INT UNSIGNED NOT NULL DEFAULT 0,
  -- 统计/展示
  `hits`          INT UNSIGNED NOT NULL DEFAULT 0,
  `download_num`  INT UNSIGNED NOT NULL DEFAULT 0,
  `is_top`        TINYINT      NOT NULL DEFAULT 0,
  `is_recommend`  TINYINT      NOT NULL DEFAULT 0,
  `is_show`       TINYINT      NOT NULL DEFAULT 1,
  `sort`          INT          NOT NULL DEFAULT 0,
  -- 类型专属字段集中放这里 (picture.images / mp4.video_url+download_url / video.file_url 等)
  `meta`          JSON             NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_type_cat` (`type`, `category_id`),
  KEY `idx_recommend` (`is_recommend`),
  KEY `idx_index_type` (`index_type_id`),
  KEY `idx_index_theme` (`index_theme_id`),
  FULLTEXT KEY `ft_title_summary` (`title`, `summary`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- 课程 + 章节 (结构特殊, 单独保留)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `courses` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `category_id`   INT UNSIGNED NOT NULL DEFAULT 0,
  `title`         VARCHAR(255) NOT NULL,
  `slug`          VARCHAR(255) NOT NULL DEFAULT '',
  `cover_url`     VARCHAR(500) NOT NULL DEFAULT '',
  `author`        VARCHAR(100) NOT NULL DEFAULT '',
  `summary`       VARCHAR(500) NOT NULL DEFAULT '',
  `body`          LONGTEXT         NULL,
  `period`        VARCHAR(50)  NOT NULL DEFAULT ''           COMMENT '课时数/周期',
  `price_money`   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `expire_type`   TINYINT      NOT NULL DEFAULT 0            COMMENT '有效期类型',
  `status`        TINYINT      NOT NULL DEFAULT 1            COMMENT '1更新中 2完结',
  `hits`          INT UNSIGNED NOT NULL DEFAULT 0,
  `is_recommend`  TINYINT      NOT NULL DEFAULT 0,
  `is_show`       TINYINT      NOT NULL DEFAULT 1,
  `sort`          INT          NOT NULL DEFAULT 0,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cat` (`category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `course_chapters` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `course_id`     BIGINT UNSIGNED NOT NULL,
  `parent_id`     BIGINT UNSIGNED NOT NULL DEFAULT 0         COMMENT '0=章, 非0=该章下课时',
  `title`         VARCHAR(255) NOT NULL,
  `file_url`      VARCHAR(700) NOT NULL DEFAULT ''           COMMENT '视频地址',
  `trial`         TINYINT      NOT NULL DEFAULT 0            COMMENT '是否可试看(原 trial_type)',
  `sort`          INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_course` (`course_id`, `parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- 会员 (原 lz_member, ~30 行) — 密码哈希升级见 migrate.mjs 说明
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `members` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username`      VARCHAR(100) NOT NULL DEFAULT '',
  `nickname`      VARCHAR(100) NOT NULL DEFAULT '',
  `password`      VARCHAR(255) NOT NULL DEFAULT ''           COMMENT '新: bcrypt/argon2; 迁移期保留 legacy_md5 兼容校验',
  `legacy_md5`    VARCHAR(64)  NOT NULL DEFAULT ''           COMMENT '原 md5(md5(pwd)), 首次登录后升级并清空',
  `avatar`        VARCHAR(500) NOT NULL DEFAULT '',
  `level`         TINYINT      NOT NULL DEFAULT 0            COMMENT '0普通/1月卡/2季卡/3年卡',
  `vip_expire_at` DATETIME         NULL                      COMMENT '原 exp_time',
  `integral`      INT          NOT NULL DEFAULT 0,
  `openid`        VARCHAR(100) NOT NULL DEFAULT ''           COMMENT '微信 openid',
  `user_type`     TINYINT      NOT NULL DEFAULT 0            COMMENT '0账号/1QQ/2微信',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_username` (`username`),
  KEY `idx_openid` (`openid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `member_courses` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `member_id`     BIGINT UNSIGNED NOT NULL,
  `course_id`     BIGINT UNSIGNED NOT NULL,
  `expire_at`     DATETIME         NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_member_course` (`member_id`, `course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `signs` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `member_id`     BIGINT UNSIGNED NOT NULL,
  `sign_date`     DATE         NOT NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_member_date` (`member_id`, `sign_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- 支付与激活码 (原 order + code + jihuo_code_types)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `code_types` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(100) NOT NULL,
  `origin_price`  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `vip_price`     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `orders` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `sn`            VARCHAR(64)  NOT NULL                      COMMENT '订单号',
  `member_id`     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `product`       VARCHAR(255) NOT NULL DEFAULT '',
  `order_type`    TINYINT      NOT NULL DEFAULT 1            COMMENT '1vip/2激活码/3课程 (原 otype)',
  `code_type_id`  INT UNSIGNED NOT NULL DEFAULT 0,
  `amount`        DECIMAL(10,2) NOT NULL DEFAULT 0.00        COMMENT '应付(原 real_amount)',
  `paid_amount`   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `status`        TINYINT      NOT NULL DEFAULT 0            COMMENT '0待支付/1已支付/2已退款',
  `paid_at`       DATETIME         NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sn` (`sn`),
  KEY `idx_member` (`member_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `codes` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`          VARCHAR(64)  NOT NULL,
  `code_type_id`  INT UNSIGNED NOT NULL DEFAULT 0,
  `status`        TINYINT      NOT NULL DEFAULT 0            COMMENT '0未使用/1已使用',
  `member_id`     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `order_sn`      VARCHAR(64)  NOT NULL DEFAULT '',
  `used_at`       DATETIME         NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_type_status` (`code_type_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- 日志 (合并 download_log + integral_log + star_log + dynamic_log)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `logs` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `kind`          VARCHAR(20)  NOT NULL                      COMMENT 'download/integral/star/dynamic',
  `member_id`     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `content_type`  VARCHAR(20)  NOT NULL DEFAULT ''           COMMENT '原 model',
  `content_id`    BIGINT UNSIGNED NOT NULL DEFAULT 0         COMMENT '原 data_id',
  `change_value`  INT          NOT NULL DEFAULT 0            COMMENT '积分变动量(integral 用)',
  `remark`        VARCHAR(255) NOT NULL DEFAULT '',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_kind_member` (`kind`, `member_id`),
  KEY `idx_download_quota` (`kind`, `member_id`, `created_at`, `content_id`),
  KEY `idx_content` (`content_type`, `content_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- 系统表
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `admins` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username`      VARCHAR(100) NOT NULL,
  `password`      VARCHAR(255) NOT NULL                      COMMENT '新: bcrypt; 旧 MD5 迁移后首次登录升级',
  `legacy_md5`    VARCHAR(64)  NOT NULL DEFAULT '',
  `name`          VARCHAR(100) NOT NULL DEFAULT '',
  `avatar`        VARCHAR(500) NOT NULL DEFAULT '',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `settings` (
  `key`           VARCHAR(100) NOT NULL,
  `value`         LONGTEXT         NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `focus` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `type`          VARCHAR(20)  NOT NULL DEFAULT 'banner',
  `title`         VARCHAR(255) NOT NULL DEFAULT '',
  `image_url`     VARCHAR(500) NOT NULL DEFAULT '',
  `video_url`     VARCHAR(500) NOT NULL DEFAULT '',
  `link_url`      VARCHAR(500) NOT NULL DEFAULT '',
  `sort`          INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `feedback` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `member_id`     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `title`         VARCHAR(255) NOT NULL DEFAULT '',
  `content`       TEXT             NULL,
  `reply`         TEXT             NULL,
  `replied_at`    DATETIME         NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 首页聚合分类 (原 index_type, 可选; index_theme 合并为 type='theme')
CREATE TABLE IF NOT EXISTS `index_types` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(100) NOT NULL,
  `kind`          VARCHAR(20)  NOT NULL DEFAULT 'type'       COMMENT 'type=内容分类聚合 / theme=专题',
  `cover_url`     VARCHAR(500) NOT NULL DEFAULT '',
  `sort`          INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 上传文件管理 (原 lz_asset) — 新后台媒体库基础
CREATE TABLE IF NOT EXISTS `assets` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uploader_id`   INT UNSIGNED NOT NULL DEFAULT 0,
  `filename`      VARCHAR(255) NOT NULL,
  `url`           VARCHAR(700) NOT NULL                      COMMENT 'OSS 地址',
  `file_md5`      VARCHAR(32)  NOT NULL DEFAULT ''           COMMENT '秒传去重',
  `suffix`        VARCHAR(20)  NOT NULL DEFAULT '',
  `size`          BIGINT       NOT NULL DEFAULT 0,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_md5` (`file_md5`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
