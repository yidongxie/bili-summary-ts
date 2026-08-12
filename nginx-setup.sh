#!/bin/bash
# BiliStudy V2 - Nginx 反向代理配置
# 用法: ./nginx-setup.sh "your-domain.com www.your-domain.com"
# 说明: Express 已在应用层输出安全响应头与静态资源缓存策略，
#       nginx 负责 TLS、压缩与反代。首次使用请配合 certbot 配置 HTTPS：
#       certbot --nginx -d your-domain.com

DOMAIN="${1:-localhost}"

cat > /etc/nginx/sites-available/bilistudy << 'EOF'
# 建议在 nginx.conf 的 http 块开启（见文末），若未开启则在此补 gzip 基础配置
gzip on;
gzip_comp_level 6;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css application/json application/javascript application/x-javascript text/javascript application/xml text/xml image/svg+xml application/xml+rss application/wasm;

server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE 支持
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }
}
EOF

sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" /etc/nginx/sites-available/bilistudy

ln -sf /etc/nginx/sites-available/bilistudy /etc/nginx/sites-enabled/

nginx -t && systemctl reload nginx

echo "Nginx 配置完成！"
echo "访问: http://$DOMAIN"
echo ""
echo "启用 HTTPS（推荐）:"
echo "  sudo apt install -y certbot python3-certbot-nginx"
echo "  sudo certbot --nginx -d $DOMAIN"
echo "启用 Brotli（可选，需 nginx 带 brotli 模块）:"
echo "  在 http 块加:"
echo "    brotli on; brotli_comp_level 6;"
echo "    brotli_types text/plain text/css application/javascript application/json image/svg+xml;"