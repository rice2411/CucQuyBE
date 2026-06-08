# VPS — Bộ lệnh theo dõi & vận hành (CucQuy)

SSH vào trước: `ssh root@45.117.179.222`
Container: `cucquy-backend` (:3000) · `cucquy-frontend` (:8080) · nginx host · domain `api.cucquy.site` / `web.cucquy.site`.

---

## 1. Kiểm tra nhanh "mọi thứ còn sống?" (chạy 1 phát)
```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" && \
curl -s -o /dev/null -w "BE  %{http_code}\n" http://127.0.0.1:3000/api/health && \
curl -s -o /dev/null -w "FE  %{http_code}\n" http://127.0.0.1:8080 && \
systemctl is-active nginx
```
Mong đợi: 2 container `Up`, BE `200`, FE `200`, nginx `active`.

---

## 2. Container (Docker)
```bash
docker ps                          # container đang chạy + cổng
docker ps -a                       # gồm cả container đã tắt/crash
docker stats --no-stream           # CPU / RAM / network từng container (snapshot)
docker stats                       # realtime (Ctrl+C để thoát)

# Log
docker logs cucquy-backend --tail 50            # 50 dòng cuối
docker logs cucquy-backend -f                    # theo dõi realtime
docker logs cucquy-backend --since 10m           # 10 phút gần đây
docker logs cucquy-frontend --tail 30

# Khởi động lại 1 container
docker restart cucquy-backend
```

## 3. Tài nguyên hệ thống
```bash
free -h            # RAM còn trống bao nhiêu
df -h              # dung lượng ổ đĩa (chú ý dòng /  và /var)
top                # CPU/RAM realtime (q để thoát)
htop               # đẹp hơn (apt install htop nếu chưa có)
uptime             # tải máy (load average) + thời gian chạy
du -sh /root/cucquy/*    # thư mục nào đang nặng
```

## 4. Docker chiếm bao nhiêu đĩa + dọn
```bash
docker system df              # images / containers / volumes / build cache
docker image prune -f         # xoá image cũ (dangling)
docker builder prune -f       # xoá build cache (thường nặng nhất)
docker system prune -af       # DỌN MẠNH: xoá mọi image/cache không dùng (cẩn thận)
```

## 5. Nginx
```bash
systemctl status nginx              # đang chạy?
nginx -t                            # kiểm tra cú pháp config
systemctl reload nginx              # nạp lại config (sau khi sửa)
nginx -T 2>/dev/null | grep -E "server_name|proxy_pass"   # domain → đẩy đi đâu

# Log truy cập / lỗi
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

## 6. SSL (Let's Encrypt)
```bash
certbot certificates                # cert + ngày hết hạn
certbot renew --dry-run             # thử gia hạn (an toàn)
systemctl list-timers | grep certbot   # timer tự renew
```

## 7. Mạng / cổng
```bash
ss -tlnp | grep -E ':3000|:8080|:80|:443'   # ai đang nghe các cổng này
curl -s https://api.cucquy.site/api/health  # test BE qua domain (ngoài)
curl -sI https://web.cucquy.site | head -1  # test FE qua domain
```

## 8. Kiểm tra .env / secret (không in giá trị)
```bash
grep -c '=' /root/cucquy/backend/.env                       # số biến
grep ALLOWED_ORIGINS /root/cucquy/backend/.env              # origin CORS
ls -la /root/cucquy/backend/service_account.json            # còn file?
```

## 9. Cập nhật code (deploy bản mới)
```bash
# Backend
cd /root/cucquy/backend && git pull origin main && \
docker compose -f docker-compose.prod.yml up -d --build && docker image prune -f

# Frontend
cd /root/cucquy/frontend && git pull origin production && \
docker build --build-arg VITE_API_URL=https://api.cucquy.site/api -t cucquy-frontend . && \
docker stop cucquy-frontend && docker rm cucquy-frontend && \
docker run -d --name cucquy-frontend --restart unless-stopped -p 127.0.0.1:8080:80 cucquy-frontend && \
docker image prune -f
```

## 10. Khi có sự cố — xem nhanh
```bash
# Container crash/restart liên tục?
docker ps -a | grep cucquy
docker logs cucquy-backend --tail 80        # tìm dòng ERROR / stack trace

# Hết RAM/đĩa?
free -h ; df -h

# BE chạy nội bộ nhưng domain không vào → kiểm nginx
nginx -t && systemctl status nginx
tail -30 /var/log/nginx/error.log

# Reboot dịch vụ (thứ tự an toàn)
docker restart cucquy-backend cucquy-frontend
systemctl reload nginx
```

---

## Ghi nhớ
- BE/FE bind `127.0.0.1` → chỉ vào được qua nginx HTTPS (`api.` / `web.cucquy.site`), không qua IP:port.
- Sửa `.env` của BE → phải `docker compose -f docker-compose.prod.yml up -d --force-recreate` (restart KHÔNG nạp env mới).
- SSL tự gia hạn; chỉ cần domain còn trỏ VPS + port 80 mở.
- Log app xem bằng `docker logs`, log truy cập/HTTP xem bằng nginx log.
