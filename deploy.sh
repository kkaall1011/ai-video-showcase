#!/bin/bash
# ============================================
# AI灵感视界 - VPS 一键部署脚本
# 适用于 Ubuntu/Debian
# ============================================

set -e

echo "========================================"
echo "  AI灵感视界 - 部署脚本"
echo "========================================"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SITE_NAME="aiinspire"
SITE_DIR="/var/www/${SITE_NAME}"

# 1. 安装 Nginx（如未安装）
echo -e "${YELLOW}[1/5] 检查 Nginx...${NC}"
if ! command -v nginx &> /dev/null; then
    sudo apt-get update -y
    sudo apt-get install -y nginx
    echo "Nginx 安装完成"
else
    echo "Nginx 已安装 ✓"
fi

# 2. 配置防火墙
echo -e "${YELLOW}[2/5] 配置防火墙...${NC}"
sudo ufw allow 'Nginx Full' 2>/dev/null || echo "UFW 未安装或已配置"
sudo ufw allow OpenSSH 2>/dev/null || echo "跳过防火墙配置"

# 3. 部署网站文件
echo -e "${YELLOW}[3/5] 部署网站文件...${NC}"
sudo mkdir -p ${SITE_DIR}
sudo cp -r /tmp/${SITE_NAME}_deploy/* ${SITE_DIR}/
sudo chown -R www-data:www-data ${SITE_DIR}
sudo chmod -R 755 ${SITE_DIR}

# 4. 配置 Nginx 站点
echo -e "${YELLOW}[4/5] 配置 Nginx 站点...${NC}"
sudo tee /etc/nginx/sites-available/${SITE_NAME} > /dev/null << 'NGINX_CONF'
server {
    listen 80;
    server_name videos.k2000.xyz;

    # HTTP → HTTPS 重定向
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name videos.k2000.xyz;

    # SSL 证书（Certbot 自动填充）
    ssl_certificate     /etc/letsencrypt/live/videos.k2000.xyz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/videos.k2000.xyz/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    root /var/www/aiinspire;
    index index.html;

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json image/svg+xml;

    # 静态资源缓存
    location /css/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /js/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # ====== 反向代理到 Express 后端 (端口 3001) ======
    # API 接口
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        client_max_body_size 500M;
    }

    # 视频文件流
    location /videos/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_cache off;
    }

    # 主站
    location / {
        try_files $uri $uri/ =404;
    }

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
}
NGINX_CONF

# 5. 启用站点并重启
echo -e "${YELLOW}[5/5] 启用站点并重启...${NC}"
sudo ln -sf /etc/nginx/sites-available/${SITE_NAME} /etc/nginx/sites-enabled/

# 保留原有的 videoshowcase 配置（如果存在）
# 不删除其他站点配置

# 测试并重启 Nginx
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

echo ""
echo -e "${GREEN}========================================"
echo "  部署完成！"
echo "========================================${NC}"
echo ""
echo "  访问地址: http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_VPS_IP')"
echo "  视频数据来自后端 API (localhost:3001)"
echo ""
echo "  目录结构："
echo "    前端文件: ${SITE_DIR}"
echo "    Nginx 配置: /etc/nginx/sites-available/${SITE_NAME}"
echo ""
echo "  验证清单："
echo "    1. curl http://localhost/               → 应返回前端页面"
echo "    2. curl http://localhost/api/videos     → 应返回视频 JSON 列表"
echo "    3. curl http://localhost/videos/xxx.mp4 → 应返回视频流"
echo ""
