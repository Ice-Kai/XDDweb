# 数据库迁移入口

GitHub 中保留数据库结构和迁移脚本，不直接提交本地全量旧库 dump。

- 初始化新库：`../../xuedda-next/db/schema.sql`
- 迁移旧库到新结构：`../../xuedda-next/db/migrate.mjs`
- 上传/素材字段补丁：`../../xuedda-next/db/alter_assets.sql`

阿里云上线时：

1. 在 RDS MySQL 或服务器 MySQL 创建目标库。
2. 导入 `schema.sql`。
3. 如需迁移旧数据，先把旧库 dump 单独上传到阿里云，再运行 `migrate.mjs`。
4. 图片/附件建议迁移到 OSS，数据库只保存资源 URL 和网盘链接。
