# Deploy Backend (NestJS) lên VPS — Hướng dẫn A→Z

Tài liệu deploy thực tế cho **CucQuy Bakery BE**. Kiến trúc:

```
Trình duyệt ── HTTPS ──▶ Vercel (FE: cucquy.site)
                              │  gọi API
                              ▼
        HTTPS ──▶ nginx (VPS) ──▶ Docker container cucquy-backend (127.0.0.1:3000)
                  api.cucquy.site                     │ firebase-admin
                                                       ▼
                                                  Firestore + Storage
```

**Thông số thực tế (đổi theo bạn):**
- VPS IP: `45.117.179.222`
- Domain API: `api.cucquy.site` (subdomain của `cucquy.site` — FE ở Vercel)
- Thư mục trên VPS: `/root/cucquy/backend`
- Repo: `https://github.com/rice2411/CucQuyBE.git`

---

## 0. Chuẩn bị (làm ở máy local)

Cần sẵn 2 file bí mật (KHÔNG có trong git):
- `backend/.env` — biến môi trường + secret (Gemini/Vision/SerpApi/Zalo/SePay...).
- `backend/service_account.json` — Firebase Admin key (Firebase Console → Project settings → Service accounts → Generate new private key).

---

## 1. DNS — trỏ subdomain về VPS

Vào nơi quản lý DNS của `cucquy.site`, thêm bản ghi:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `api` | `45.117.179.222` | 1 giờ |

> `cucquy.site` (gốc) vẫn trỏ Vercel; `api.cucquy.site` trỏ VPS — 2 record độc lập.

Kiểm tra (máy local), đợi tới khi ra đúng IP:
```bash
dig +short api.cucquy.site      # → 45.117.179.222
```

---

## 2. Cài Docker trên VPS

```bash
ssh root@45.117.179.222
curl -fsSL https://get.docker.com | sh
docker --version && docker compose version
```

---

## 3. Lấy source code

```bash
mkdir -p /root/cucquy
cd /root/cucquy
git clone https://github.com/rice2411/CucQuyBE.git backend
cd backend
ls        # thấy Dockerfile, docker-compose.prod.yml, src, package.json...
```

---

## 4. Đưa 2 file secret lên VPS

**Cách A — scp (chạy ở MÁY LOCAL).** Chú ý dấu `:` sau IP:
```bash
scp /duong/dan/local/backend/.env \
    /duong/dan/local/backend/service_account.json \
    root@45.117.179.222:/root/cucquy/backend/
```

**Cách B — tạo trực tiếp trên VPS** (nếu scp vướng): `nano /root/cucquy/backend/.env` rồi dán nội dung; tương tự `service_account.json`.

Đặt quyền + kiểm tra (2 file phải nằm CÙNG thư mục `backend/`, cạnh `docker-compose.prod.yml`):
```bash
cd /root/cucquy/backend
chmod 600 .env service_account.json
ls -la .env service_account.json
```

**Sửa `.env` cho production:**
```bash
nano .env
```
- `ALLOWED_ORIGINS=https://cucquy.site`  (domain FE — quan trọng cho CORS)
- Đảm bảo đủ: `FIREBASE_STORAGE_BUCKET`, `GEMINI_API_KEY`, `VISION_API_KEY`, `SERPAPI_KEY`, `ZALO_*`, `SEPAY_*`.

---

## 5. Build & chạy Docker

```bash
cd /root/cucquy/backend
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps        # PORTS = 127.0.0.1:3000->3000/tcp ; NAME = cucquy-backend
curl http://127.0.0.1:3000/api/health               # → {"...","success":true}
```

Nếu lỗi, xem log:
```bash
docker compose -f docker-compose.prod.yml logs --tail=50
```

---

## 6. Nginx + HTTPS (Let's Encrypt)

```bash
apt update && apt install -y nginx certbot python3-certbot-nginx
```

Tạo config bằng **nano** (tránh lỗi paste heredoc):
```bash
nano /etc/nginx/sites-available/api
```
Dán đúng đoạn này:
```nginx
server {
    listen 80;
    server_name api.cucquy.site;
    client_max_body_size 15m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Kích hoạt + cấp SSL (chạy TỪNG lệnh):
```bash
ln -sf /etc/nginx/sites-available/api /etc/nginx/sites-enabled/api
rm -f /etc/nginx/sites-enabled/default
nginx -t                       # phải "syntax is ok" + "test is successful"
systemctl reload nginx
certbot --nginx -d api.cucquy.site
```
Certbot hỏi: email → ToS `Y` → redirect HTTP→HTTPS chọn **`2`**.

**Test:**
```bash
curl https://api.cucquy.site/api/health
```
Trình duyệt: `https://api.cucquy.site/api/docs` (Swagger).

---

## 7. Nối FE + tích hợp (làm ở dashboard tương ứng)

- **Vercel (FE)** → Settings → Environment Variables: `VITE_API_URL=https://api.cucquy.site/api` → **Redeploy**.
- **Firebase Console** → Authentication → Settings → Authorized domains: thêm `cucquy.site`.
- **SePay** dashboard → webhook URL: `https://api.cucquy.site/api/webhooks/sepay`
- **Facebook** service → webhook URL: `https://api.cucquy.site/api/webhooks/facebook`
- (Dọn) Trên Vercel xoá các env secret không còn cần ở FE: `GEMINI_API_KEY`, `VISION_API_KEY`, `SERPAPI_API_KEY`, `ZALO_TOKEN`, `ZALO_SHOP_CODE`, `SEPAY_*`, `VAPID_KEY`, `ZALO_MAIN_GROUP_ID` (chỉ giữ `VITE_API_URL` + `FIREBASE_*`).

---

## 8. Cập nhật code sau này

```bash
cd /root/cucquy/backend
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
docker image prune -f          # dọn image cũ
```
(`.env` + `service_account.json` được .gitignore nên `git pull` không đụng tới.)

---

## 9. Lệnh vận hành

```bash
docker compose -f docker-compose.prod.yml ps          # trạng thái
docker compose -f docker-compose.prod.yml logs -f      # log realtime
docker compose -f docker-compose.prod.yml restart      # restart (sau khi đổi .env)
docker compose -f docker-compose.prod.yml down         # dừng
systemctl reload nginx                                 # reload nginx
certbot renew --dry-run                                # test auto-renew SSL
```

---

## 10. Lỗi thường gặp (đã gặp khi deploy)

**`port is already allocated` / container PORTS trống / curl 127.0.0.1:3000 fail**
→ Còn container cũ chiếm port 3000. Tắt thủ công rồi recreate:
```bash
docker ps                                  # tìm container cũ (vd backend-backend-1)
docker stop <tên> && docker rm <tên>
docker rmi backend-backend 2>/dev/null
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

**`scp: No such file or directory`** → thiếu dấu `:` sau IP. Đúng: `root@45.117.179.222:/root/cucquy/backend/`.

**Heredoc (`cat <<EOF`) treo ở dấu `>`** → paste lỗi. Nhấn `Ctrl+C`, dùng `nano` tạo file thay vì heredoc.

**Log `Thiếu cấu hình Firebase Admin`** → `.env`/`service_account.json` không nằm trong `/root/cucquy/backend/` (phải cùng thư mục `docker-compose.prod.yml`).

**`service_account.json` thành thư mục rỗng** → do mount khi file chưa tồn tại. Xoá rồi đặt lại file:
```bash
rmdir /root/cucquy/backend/service_account.json 2>/dev/null
# rồi scp/nano lại file
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

**certbot fail** → DNS chưa trỏ (`dig +short api.cucquy.site` chưa ra IP) hoặc port 80 bận. Đợi DNS / kiểm `nginx -t`.

**FE gọi API bị CORS** → `ALLOWED_ORIGINS` trong `.env` chưa khớp domain FE (`https://cucquy.site`). Sửa rồi `restart`.

---

## Ghi chú bảo mật
- `.env` + `service_account.json` **chỉ ở VPS**, không commit (đã .gitignore/.dockerignore).
- Container bind `127.0.0.1` → không phơi port 3000 ra internet; mọi traffic qua nginx HTTPS.
- Nếu secret từng lộ (commit/log/bundle cũ) → rotate key (Gemini, Vision, SerpApi, SePay secret, Zalo token).
