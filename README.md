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

## Deploy (Railway/Render/Fly)
- Build: `npm run build` · Start: `npm run start:prod` (hoặc dùng `Dockerfile`).
- Set env: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `ALLOWED_ORIGINS`, `PORT`.
- ⚠️ Service account là bí mật — chỉ để ở env, không commit.

## Lộ trình
- [x] Phase 0: khung + Firebase Admin + Auth/Roles + health.
- [x] Phase 1: domain **commission** (pilot).
- [ ] Phase 2+: orders, products, customers, transactions, materials, expenses, users...
- [ ] Dời webhook/job (sepay, facebook, zalo, gemini/ocr) + cron.
- [ ] Siết Firestore rules (sau khi mọi ghi của collection đã qua BE).
