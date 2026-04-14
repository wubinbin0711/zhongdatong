# 中大通 ZDT Order System (V1 Baseline)

这是按你需求落地的可迭代基线版本，目标是后续改功能时不推翻结构。

## 当前结构

- `src/`: React 前端（登录、订单列表、新增订单、子账号管理、平台登录控制）
- `server/src/`: Express 后端 API（鉴权、多租户、权限、订单、账号管理、上传）
- `server/prisma/schema.prisma`: 数据库模型（MySQL）
- `server/uploads/`: 本地图片上传目录（开发环境）
- `deploy/nginx/zdt.conf`: 阿里云 Nginx 反向代理模板
- `deploy/pm2/ecosystem.config.cjs`: PM2 启动配置
- `deploy/aliyun/DEPLOY.md`: 阿里云完整上线步骤

## 已实现的核心规则

- 账号密码登录
- 同库多租户数据隔离（所有业务查询都带 tenant 约束）
- 角色权限
  - 超级管理员（`PLATFORM_ADMIN`）：可新增企业母账号/子账号，可禁用其登录
  - 创建企业步骤即创建母账号（无需企业编码）
  - 创建子账号时选择上级母账号，系统自动绑定所属企业
  - 企业母账号（`ADMIN`）：仅可新建/删除订单，不能新建账号
  - 企业子账号（`SUB_ACCOUNT`）：仅可查看“其上级企业母账号创建”的订单，可改状态，不可删除
  - 企业母账号命名规则：账号后缀必须是 `01`、`02` 或 `03`
- 订单字段
  - `content`（整段文本）
  - `ownerCode`（负责人编号）
  - `status`（可随意切换）
  - `image`（本地上传图片）

## 环境准备

1. 复制 `.env.example` 为 `.env`
2. 填写 MySQL 连接（建议阿里云 RDS MySQL）
3. 安装 Node.js 20+ 与 npm
4. `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` 只放服务器 `.env`，不要提交到 Git

## 本地启动

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

- 前端: `http://localhost:5173`
- 后端: `http://localhost:3001`

## 首次初始化账号

先通过接口创建租户管理员：

- `POST /api/auth/bootstrap-admin`
  - `key`: `BOOTSTRAP_KEY`
  - `tenantName`
  - `tenantCode`
  - `account`
  - `password`

如果要创建平台管理员：

- `POST /api/auth/bootstrap-platform`
  - `key`
  - `account`
  - `password`

## 阿里云上线建议（可扩展）

- 应用服务：ECS + PM2（或容器化部署）
- 数据库：RDS MySQL
- 静态资源：前端可放 OSS + CDN（可选）
- 图片上传：
  - 已支持 `STORAGE_PROVIDER=oss`，生产可直接切 OSS（保留 `imageUrl` 字段不变）
- 反向代理：Nginx
  - `/` -> 前端
  - `/api`、`/uploads` -> Node API

## 后续迭代约束（防乱改）

- 新功能只做增量迁移，不直接手改线上表
- API 只新增字段，不随意改语义
- 模块边界保持：`auth` / `orders` / `admin-users` / `platform`
- 权限逻辑统一在后端，不把关键权限放到前端判断
