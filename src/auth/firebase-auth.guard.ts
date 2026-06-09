import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FirestoreService } from '../firebase/firestore.service';
import { RedisService } from '../redis/redis.service';
import { IS_PUBLIC_KEY } from './roles.decorator';
import { AuthUser, UserRole } from './user.types';

/** TTL cache hồ sơ user (giây). Đổi role có hiệu lực chậm nhất sau ngần này. */
const USER_CACHE_TTL = 300;
export const userCacheKey = (uid: string) => `auth:user:${uid}`;

/** Phần hồ sơ lấy từ Firestore (cache được) — email lấy từ token, không cache. */
interface CachedProfile {
  role: UserRole | null;
  displayName: string | null;
}

/** Chuẩn hoá role thô từ Firestore về UserRole enum (giống normalizeRole của FE). */
function normalizeRole(raw: unknown): UserRole | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.toLowerCase();
  if (s === 'super_admin') return UserRole.SUPER_ADMIN;
  if (s === 'admin') return UserRole.ADMIN;
  if (s === 'colaborator') return UserRole.COLABORATOR;
  return undefined;
}

/**
 * Verify Firebase ID token (Authorization: Bearer <token>), nạp role từ
 * collection `users` (doc id = uid), gắn AuthUser vào request.
 */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly firestore: FirestoreService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Thiếu Bearer token');
    }
    const token = header.slice('Bearer '.length).trim();

    let decoded: { uid: string; email?: string };
    try {
      decoded = await this.firestore.auth().verifyIdToken(token);
    } catch {
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
    }

    // Cache hồ sơ user → tránh đọc Firestore users/{uid} trên MỖI request.
    // Miss/Redis lỗi → đọc Firestore rồi nạp lại cache (TTL ngắn).
    let profile = await this.redis.get<CachedProfile>(userCacheKey(decoded.uid));
    if (!profile) {
      const snap = await this.firestore.collection('users').doc(decoded.uid).get();
      const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
      profile = {
        role: normalizeRole(data.role) ?? null,
        displayName:
          typeof data.customName === 'string'
            ? data.customName
            : typeof data.displayName === 'string'
              ? data.displayName
              : null,
      };
      await this.redis.set(userCacheKey(decoded.uid), profile, USER_CACHE_TTL);
    }

    const user: AuthUser = {
      uid: decoded.uid,
      email: decoded.email,
      role: profile.role ?? undefined,
      displayName: profile.displayName ?? undefined,
    };
    req.user = user;
    return true;
  }
}
