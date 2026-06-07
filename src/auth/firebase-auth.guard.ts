import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FirestoreService } from '../firebase/firestore.service';
import { IS_PUBLIC_KEY } from './roles.decorator';
import { AuthUser, UserRole } from './user.types';

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

    const snap = await this.firestore.collection('users').doc(decoded.uid).get();
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};

    const user: AuthUser = {
      uid: decoded.uid,
      email: decoded.email,
      role: normalizeRole(data.role),
      displayName:
        typeof data.customName === 'string'
          ? data.customName
          : typeof data.displayName === 'string'
            ? data.displayName
            : undefined,
    };
    req.user = user;
    return true;
  }
}
