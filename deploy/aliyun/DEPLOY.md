# 中大通 ZDT 阿里云上线指南

以下流程以 `Ubuntu 22.04 + ECS + RDS MySQL + OSS` 为例。

## 1. 服务器准备

```bash
sudo apt update
sudo apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2
```

## 2. 部署目录

```bash
sudo mkdir -p /var/www/zdt
sudo chown -R $USER:$USER /var/www/zdt
cd /var/www/zdt
```

把项目代码放到该目录（git clone 或 scp）。

## 3. 安装与构建

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run build
npm run build:api
```

## 4. 生产环境变量

在项目根目录创建 `.env`，至少包含：

```env
DATABASE_URL="mysql://user:password@rds-host:3306/zdt_order"
JWT_SECRET="replace-with-strong-secret"
BOOTSTRAP_KEY="replace-bootstrap-key"
CORS_ORIGIN="https://your-domain.com"
PORT=3001
STORAGE_PROVIDER="oss"
OSS_REGION="oss-cn-shenzhen"
OSS_BUCKET="your-bucket"
OSS_ENDPOINT="oss-cn-shenzhen.aliyuncs.com"
OSS_ACCESS_KEY_ID="your-ak"
OSS_ACCESS_KEY_SECRET="your-sk"
OSS_CDN_BASE_URL="https://cdn.your-domain.com"
```

## 5. PM2 启动 API

```bash
pm2 start deploy/pm2/ecosystem.config.cjs
pm2 save
pm2 startup
```

查看状态：

```bash
pm2 status
pm2 logs zdt-api
```

## 6. Nginx 反向代理

```bash
sudo cp deploy/nginx/zdt.conf /etc/nginx/sites-available/zdt.conf
sudo ln -s /etc/nginx/sites-available/zdt.conf /etc/nginx/sites-enabled/zdt.conf
sudo nginx -t
sudo systemctl reload nginx
```

说明：
- 前端静态目录默认 `/var/www/zdt/dist`，请按你的实际目录调整 `root`
- API 走 `/api/* -> 127.0.0.1:3001`
- 如果使用 OSS，可删除 `/uploads` 这段 location

## 7. HTTPS（推荐）

使用 Certbot：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 8. 首次创建账号

先创建企业管理员：
- `POST /api/auth/bootstrap-admin`

可选创建平台管理员：
- `POST /api/auth/bootstrap-platform`

## 9. 发布更新流程

```bash
cd /var/www/zdt
git pull
npm install
npm run prisma:generate
npm run prisma:migrate
npm run build
npm run build:api
pm2 restart zdt-api
sudo systemctl reload nginx
```
