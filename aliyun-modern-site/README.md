# 薛大大设计网新站包

这个目录只作为“新站迁移索引”，避免和根目录里的旧 PHP 站混在一起。

## 新站代码

- 主项目：`../xuedda-next`
- 技术栈：Astro SSR + MySQL + 后台管理页
- 本地启动：`cd ../xuedda-next && npm install && npm run dev`
- 生产构建：`cd ../xuedda-next && npm run build`

## 数据库

- 新库结构：`../xuedda-next/db/schema.sql`
- 旧库迁移脚本：`../xuedda-next/db/migrate.mjs`
- 资源字段补丁：`../xuedda-next/db/alter_assets.sql`

全量旧 PHP 数据库 dump 较大，且可能包含真实用户/业务数据，不提交到 GitHub。迁移到阿里云时建议单独通过 OSS/RDS/DMS 导入。

## 部署

- 部署文档：`../xuedda-next/deploy/`
- 环境变量模板：`../xuedda-next/.env.example`

老 PHP 站目录 `../www.xuedda.com/` 仅作本地参考，不属于新站代码包。
