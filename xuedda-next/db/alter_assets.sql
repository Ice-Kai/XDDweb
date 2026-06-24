-- 阶段3 媒体库：assets 表增补列（方案 ADMIN_UPLOAD_PLAN.md §6）
-- 幂等性：列若已存在会报错，仅首次执行。
ALTER TABLE `assets`
  ADD COLUMN `driver`    VARCHAR(10)  NOT NULL DEFAULT 'local' AFTER `url`,
  ADD COLUMN `mime`      VARCHAR(100) NOT NULL DEFAULT ''       AFTER `suffix`,
  ADD COLUMN `kind`      VARCHAR(20)  NOT NULL DEFAULT 'image'  AFTER `mime`,
  ADD COLUMN `ref_count` INT          NOT NULL DEFAULT 0        AFTER `kind`,
  ADD UNIQUE KEY `uk_md5` (`file_md5`);
