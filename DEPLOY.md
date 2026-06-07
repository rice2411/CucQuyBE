# Deploy BE lên VPS (Ubuntu + domain + HTTPS)

BE chạy trong Docker, **bind `127.0.0.1:3000`**; **nginx** trên VPS reverse-proxy
domain → BE và cấp **HTTPS (Let's Encrypt)**. FE vẫn ở Vercel, trỏ về domain này.

Giả định domain API: `api.tiembanhcucquy.com` (đổi theo bạn). FE Vercel: `https://cucquy.vercel.app`.

---

## 0. Chuẩn bị DNS
Tạo bản ghi **A**: `api.tiembanhcucquy.com → <IP VPS>`. Chờ trỏ xong (`ping` ra IP VPS).

## 1. Cài Docker trên VPS
```bash
ssh root@<IP_VPS>
curl -fsSL https://get.docker.com | sh
docker --version && docker compose version
```

## 2. Lấy source
```bash
cd /opt
git clone https://github.com/rice2411/CucQuyBE.git backend
cd backend
```

## 3. Tạo 2 file bí mật (KHÔNG có trong repo)
```bash
# a) service account — copy từ máy bạn lên VPS:
#    (chạy ở MÁY LOCAL)
scp service_account.json root@<IP_VPS>:/opt/backend/service_account.json

# b) .env — tạo trên VPS
nano /opt/backend/.env
```
Nội dung `.env` (điền secret thật; FIREBASE_* có thể bỏ nếu dùng service_account.json):
```env
PORT=3000
ALLOWED_ORIGINS=https://cucquy.vercel.app
FIREBASE_STORAGE_BUCKET=tiembanhcucquy-75fe1.firebasestorage.app
SERPAPI_KEY=...
VISION_API_KEY=...
GEMINI_API_KEY=...
ZALO_URL=https://new.abitstore.vn
ZALO_SHOP_CODE=...
ZALO_TOKEN=...
ZALO_MAIN_GROUP_ID=...
SEPAY_MERCHANT_ID=...
SEPAY_SECRET_KEY=...
```
> Creds Firebase Admin đọc từ `service_account.json` (đã mount). Nếu muốn dùng env thay file thì set `FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY`.

## 4. Build & chạy BE
```bash
cd /opt/backend
docker compose -f docker-compose.prod.yml up -d --build
# kiểm tra (chạy nội bộ, chưa ra ngoài):
curl http://127.0.0.1:3000/api/health      # → {"data":{"status":"ok"...},"success":true}
docker compose -f docker-compose.prod.yml logs -f backend
```

## 5. Nginx reverse proxy + HTTPS
```bash
apt update && apt install -y nginx certbot python3-certbot-nginx
nano /etc/nginx/sites-available/api
```
Nội dung:
```nginx
server {
    listen 80;
    server_name api.tiembanhcucquy.com;

    client_max_body_size 15m;   # cho upload ảnh / OCR base64

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Kích hoạt + cấp SSL:
```bash
ln -s /etc/nginx/sites-available/api /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d api.tiembanhcucquy.com      # tự thêm HTTPS + auto-renew
```
Kiểm tra ngoài: `https://api.tiembanhcucquy.com/api/health`

## 6. Mở firewall (nếu dùng ufw)
```bash
ufw allow 'Nginx Full'   # 80 + 443
ufw allow OpenSSH
ufw enable
```

## 7. Trỏ FE + tích hợp về domain mới
- **Vercel (FE)** → Environment Variables: `VITE_API_URL=https://api.tiembanhcucquy.com/api` → redeploy FE.
- **Firebase Console** → Authentication → Settings → **Authorized domains**: thêm domain FE Vercel (để Google login chạy).
- **SePay dashboard** → webhook URL: `https://api.tiembanhcucquy.com/api/webhooks/sepay`
- **Facebook service** → webhook URL: `https://api.tiembanhcucquy.com/api/webhooks/facebook`

## 8. Swagger
`https://api.tiembanhcucquy.com/api/docs`

---

## Cập nhật khi có code mới
```bash
cd /opt/backend
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker image prune -f          # dọn image cũ
```

## Lệnh vận hành
```bash
docker compose -f docker-compose.prod.yml ps          # trạng thái
docker compose -f docker-compose.prod.yml logs -f      # log
docker compose -f docker-compose.prod.yml restart      # restart
docker compose -f docker-compose.prod.yml down         # dừng
```

## Lưu ý
- `.env` + `service_account.json` chỉ tồn tại trên VPS, KHÔNG commit (đã .gitignore/.dockerignore).
- `ALLOWED_ORIGINS` phải là domain FE thật (https) — sai thì trình duyệt chặn CORS.
- Container chỉ bind `127.0.0.1` → không truy cập trực tiếp `:3000` từ internet; mọi traffic qua nginx HTTPS.
