-- AI 积分、卡密与生图审计。
-- 这些表独立于旧 PHP 表；余额仍同步写入 lz_member.integral，保证新旧用户一致。
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `xdd_credit_products` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(120) NOT NULL,
  `credits` INT NOT NULL,
  `price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `description` VARCHAR(255) NOT NULL DEFAULT '',
  `is_active` TINYINT NOT NULL DEFAULT 1,
  `sort` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_active_sort` (`is_active`,`sort`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `xdd_credit_codes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `product_id` BIGINT UNSIGNED NOT NULL,
  `code_hash` CHAR(64) NOT NULL,
  `code_hint` VARCHAR(16) NOT NULL DEFAULT '',
  `credits` INT NOT NULL,
  `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0=unused,1=redeemed,2=disabled',
  `redeemed_by` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `redeemed_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code_hash` (`code_hash`),
  KEY `idx_product_status` (`product_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `xdd_credit_ledger` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `member_id` BIGINT UNSIGNED NOT NULL,
  `amount` INT NOT NULL COMMENT 'positive=credit, negative=debit',
  `balance_after` INT NOT NULL,
  `kind` VARCHAR(32) NOT NULL COMMENT 'redeem/generation/refund/admin/order',
  `reference_type` VARCHAR(32) NOT NULL DEFAULT '',
  `reference_id` VARCHAR(80) NOT NULL DEFAULT '',
  `description` VARCHAR(255) NOT NULL DEFAULT '',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_member_reference` (`member_id`,`kind`,`reference_type`,`reference_id`),
  KEY `idx_member_created` (`member_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `xdd_registration_guard` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `member_id` BIGINT UNSIGNED NOT NULL,
  `ip_hash` CHAR(64) NOT NULL,
  `device_hash` CHAR(64) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_member_id` (`member_id`),
  KEY `idx_ip_created` (`ip_hash`,`created_at`),
  KEY `idx_device_created` (`device_hash`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `xdd_credit_orders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_sn` VARCHAR(40) NOT NULL,
  `member_id` BIGINT UNSIGNED NOT NULL,
  `product_id` BIGINT UNSIGNED NOT NULL,
  `product_name` VARCHAR(120) NOT NULL,
  `credits` INT NOT NULL,
  `amount_fen` INT UNSIGNED NOT NULL,
  `channel` VARCHAR(20) NOT NULL DEFAULT 'wechat_native',
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `provider_trade_no` VARCHAR(80) NULL,
  `code_url` TEXT NULL,
  `paid_at` DATETIME NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_sn` (`order_sn`),
  UNIQUE KEY `uk_provider_trade_no` (`provider_trade_no`),
  KEY `idx_member_created` (`member_id`,`created_at`),
  KEY `idx_status_expires` (`status`,`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `xdd_ai_generations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `member_id` BIGINT UNSIGNED NOT NULL,
  `request_id` CHAR(36) NOT NULL,
  `prompt` TEXT NOT NULL,
  `ratio` VARCHAR(10) NOT NULL DEFAULT '16:9',
  `credit_cost` INT NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'processing',
  `provider_task_id` VARCHAR(100) NULL,
  `provider_model` VARCHAR(100) NULL,
  `provider_progress` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `image_url` MEDIUMTEXT NULL,
  `error_message` VARCHAR(500) NOT NULL DEFAULT '',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_request_id` (`request_id`),
  KEY `idx_provider_task` (`provider_task_id`),
  KEY `idx_member_created` (`member_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `xdd_ai_channels` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `base_url` VARCHAR(500) NOT NULL,
  `api_key_encrypted` TEXT NOT NULL,
  `key_hint` VARCHAR(24) NOT NULL DEFAULT '',
  `is_enabled` TINYINT NOT NULL DEFAULT 1,
  `priority` INT NOT NULL DEFAULT 100,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_enabled_priority` (`is_enabled`,`priority`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `xdd_credit_products` (`name`,`credits`,`price`,`description`,`sort`)
SELECT 'AI 创作体验包', 100, 1.00, '1 元 = 100 积分，可用于 AI 生图和后续 AI 功能。', 10
WHERE NOT EXISTS (SELECT 1 FROM `xdd_credit_products` WHERE `name` = 'AI 创作体验包');

UPDATE `xdd_credit_products`
SET `credits`=100,`price`=1.00,`description`='1 元 = 100 积分，可用于 AI 生图和后续 AI 功能。',`sort`=10
WHERE `name`='AI 创作体验包';

INSERT INTO `xdd_credit_products` (`name`,`credits`,`price`,`description`,`sort`)
SELECT 'AI 创作进阶包', 1000, 10.00, '1000 积分，价格严格按 1 元 = 100 积分。', 20
WHERE NOT EXISTS (SELECT 1 FROM `xdd_credit_products` WHERE `name` = 'AI 创作进阶包');

UPDATE `xdd_credit_products`
SET `credits`=1000,`price`=10.00,`description`='1000 积分，价格严格按 1 元 = 100 积分。',`sort`=20
WHERE `name`='AI 创作进阶包';

INSERT INTO `xdd_credit_products` (`name`,`credits`,`price`,`description`,`sort`)
SELECT 'AI 创作专业包', 5000, 50.00, '5000 积分，价格严格按 1 元 = 100 积分。', 30
WHERE NOT EXISTS (SELECT 1 FROM `xdd_credit_products` WHERE `name` = 'AI 创作专业包');
