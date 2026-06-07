# CucQuyBakery — Backend (NestJS)

Backend tách khỏi FE, **giữ Firestore** (qua `firebase-admin`). Mục tiêu: bảo mật/ẩn
logic, trung tâm hóa nghiệp vụ, chạy webhook/job server-side. FE login bằng Firebase
Auth và gửi ID token; server verify token + phân quyền theo `role` trong collection `users`.

## Cài đặt
```bash
npm install
cp .env.example .env   # điền service account + ALLOWED_ORIGINS
npm run start:dev      # http://localhost:3000/api
```

### Lấy service account
Firebase Console → Project settings → Service accounts → **Generate new private key**.
Đổ vào `.env`: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
(giữ nguyên `\n` trong private key — code tự xử lý).

## Kiến trúc
- `src/firebase/` — init Admin SDK (singleton) + `FirestoreService` (chỗ duy nhất chạm DB).
- `src/auth/` — `FirebaseAuthGuard` (verify ID token, nạp role) + `RolesGuard` + `@Roles`/`@CurrentUser`/`@Public`.
- `src/modules/<domain>/` — controller + service + dto. Mỗi domain port dần từ `services/` của FE.

## Endpoints hiện có
| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/health` | public | health check |
| GET | `/api/commission/summaries` | admin | thống kê HH tất cả CTV |
| GET | `/api/commission/me` | đã đăng nhập | HH của chính mình |
| POST | `/api/commission/mark-paid` | admin | `{ orderIds }` đánh dấu đã trả |
| POST | `/api/commission/mark-pending` | admin | `{ orderIds }` đặt lại chưa trả |

Mọi request (trừ `@Public`) cần header `Authorization: Bearer <Firebase ID token>`.

Các domain CRUD khác đều theo cùng pattern (đều cần đăng nhập): `/api/products`,
`/api/customers`, `/api/expenses`, `/api/transactions`, `/api/categories`,
`/api/badges`, `/api/commission-groups`, `/api/configurations/*`, `/api/users`,
`/api/orders`, `/api/stock-receipts`, `/api/admin-db/*`, `/api/images/*`.

### Webhook (PUBLIC — không cần token)
| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/webhooks/sepay` | SePay: lưu transaction + set order PAID nếu khớp orderNumber |
| POST | `/api/webhooks/facebook` | Fanpage inbox: lưu message (idempotent theo `id_new_message`) |

Trả format GỐC của nhà cung cấp (không bọc envelope `{data,...}`).
⚠️ **URL đổi** so với bản Vercel cũ (`/api/sepay/webhook`, `/api/facebook/webhook`):
sau khi deploy BE phải cập nhật URL webhook trong dashboard **SePay** và **Facebook
service** sang `https://<be-domain>/api/webhooks/sepay` · `/facebook`.

## Deploy (Railway/Render/Fly)
- Build: `npm run build` · Start: `npm run start:prod` (hoặc dùng `Dockerfile`).
- Set env: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_STORAGE_BUCKET`, `ALLOWED_ORIGINS`, `PORT`.
- ⚠️ Service account là bí mật — chỉ để ở env, không commit.

## Lộ trình
- [x] Phase 0: khung + Firebase Admin + Auth/Roles + health.
- [x] Phase 1: domain **commission** (pilot).
- [x] Phase 2: products, customers, expenses, transactions, categories, badges, commissionGroups, configurations, users, orders, stockReceipt, admin-db, images.
- [x] Webhook sepay + facebook.
- [ ] Job nền còn lại: zalo notify (đang ở FE sau khi gọi API), gemini/ocr, cron.
- [ ] Siết Firestore rules (sau khi mọi ghi của collection đã qua BE).
