#!/bin/bash
# BiliStudy V2 - Nginx 反向代理配置
# 用法: ./nginx-setup.sh "your-domain.com www.your-domain.com"

DOMAIN="${1:-localhost}"

cat > /etc/nginx/sites-available/bilistudy << 'EOF'
server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;

    client_max_body_size 10m;

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
