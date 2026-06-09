import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirestoreService } from '../../firebase/firestore.service';
import { RedisService } from '../../redis/redis.service';
import { userCacheKey } from '../../auth/firebase-auth.guard';
import {
  UserData,
  UserRole,
  UserStatus,
  ZaloGroupConfigInput,
} from './users.types';

const COL = 'users';

/** Chuẩn hoá status thô từ Firestore về UserStatus. */
function asStatus(raw: unknown): UserStatus {
  if (raw === 'active' || raw === 'inactive' || raw === 'pending') return raw;
  return 'pending';
}

/** Chuẩn hoá role thô từ Firestore về UserRole. */
function asRole(raw: unknown): UserRole {
  if (raw === 'super_admin' || raw === 'admin' || raw === 'colaborator') {
    return raw;
  }
  return 'colaborator';
}

@Injectable()
export class UsersService {
  constructor(
    private readonly fs: FirestoreService,
    private readonly redis: RedisService,
  ) {}

  /** Map doc Firestore thô → UserData (type-guard mọi field, untrusted). */
  private toUserData(uid: string, r: Record<string, unknown>): UserData {
    return {
      uid,
      email: typeof r.email === 'string' ? r.email : null,
      displayName: typeof r.displayName === 'string' ? r.displayName : null,
      photoURL: typeof r.photoURL === 'string' ? r.photoURL : null,
      customName: typeof r.customName === 'string' ? r.customName : undefined,
      status: asStatus(r.status),
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : '',
      lastLoginAt: typeof r.lastLoginAt === 'string' ? r.lastLoginAt : '',
      role: asRole(r.role),
      zaloCtvGroupChatId:
        typeof r.zaloCtvGroupChatId === 'string'
          ? r.zaloCtvGroupChatId
          : r.zaloCtvGroupChatId === null
            ? null
            : undefined,
    };
  }

  // ── Đọc ─────────────────────────────────────────────────────
  async getUserByUid(uid: string): Promise<UserData | null> {
    if (!uid) return null;
    const snap = await this.fs.collection(COL).doc(uid).get();
    if (!snap.exists) return null;
    return this.toUserData(snap.id, snap.data() as Record<string, unknown>);
  }

  async getUserByEmail(email: string | null): Promise<UserData | null> {
    if (!email) return null;
    const snap = await this.fs
      .collection(COL)
      .where('email', '==', email)
      .limit(1)
      .get();
    if (snap.empty) return null;
    const d = snap.docs[0];
    return this.toUserData(d.id, d.data() as Record<string, unknown>);
  }

  async getAllUsers(): Promise<UserData[]> {
    const snap = await this.fs.collection(COL).get();
    return snap.docs.map((d) =>
      this.toUserData(d.id, d.data() as Record<string, unknown>),
    );
  }

  // ── Ghi ─────────────────────────────────────────────────────
  /**
   * Lưu/cập nhật doc users/{uid} ngay sau khi đăng nhập.
   * - uid/email/displayName/photoURL lấy từ token (auth), merge cùng body FE truyền (nếu có).
   * - Nếu user đã tồn tại → chỉ cập nhật lastLoginAt và return doc hiện có.
   * - Nếu chưa tồn tại → tạo mới với status pending, role colaborator.
   */
  async saveUser(
    auth: { uid: string; email?: string | null; displayName?: string | null },
    body: Record<string, unknown>,
  ): Promise<UserData> {
    const uid = auth.uid;
    const ref = this.fs.collection(COL).doc(uid);

    // Tìm bản ghi đã tồn tại theo uid hoặc email (giống FE cũ).
    const existingByUid = await this.getUserByUid(uid);
    const email =
      typeof body.email === 'string'
        ? body.email
        : (auth.email ?? null);
    const existingByEmail = existingByUid
      ? null
      : await this.getUserByEmail(email);

    const now = admin.firestore.Timestamp.now().toDate().toISOString();

    if (existingByUid || existingByEmail) {
      const existing = (existingByUid || existingByEmail) as UserData;
      const targetRef = this.fs.collection(COL).doc(existing.uid);
      await targetRef.set({ lastLoginAt: now }, { merge: true });
      return { ...existing, lastLoginAt: now };
    }

    const userData: UserData = {
      uid,
      email,
      displayName:
        typeof body.displayName === 'string'
          ? body.displayName
          : (auth.displayName ?? null),
      photoURL: typeof body.photoURL === 'string' ? body.photoURL : null,
      status: 'pending',
      createdAt: now,
      lastLoginAt: now,
      role: 'colaborator',
    };

    await ref.set(userData);
    return userData;
  }

  async updateUserStatus(uid: string, status: UserStatus): Promise<void> {
    await this.fs.collection(COL).doc(uid).set({ status }, { merge: true });
  }

  async updateUserCustomName(uid: string, customName: string): Promise<void> {
    await this.fs.collection(COL).doc(uid).set({ customName }, { merge: true });
    await this.redis.del(userCacheKey(uid)); // displayName đổi → bỏ cache
  }

  async updateUserRole(uid: string, role: UserRole): Promise<void> {
    await this.fs.collection(COL).doc(uid).set({ role }, { merge: true });
    await this.redis.del(userCacheKey(uid)); // role đổi → bỏ cache để có hiệu lực ngay
  }

  /**
   * Ghi zaloCtvGroupChatId lên từng user doc theo membership group Zalo
   * (clear về null khi user không thuộc group nào). Port từ FE.
   */
  async syncZaloCtvGroupFieldsFromGroups(
    groups: ZaloGroupConfigInput[],
  ): Promise<void> {
    const uidToChat = new Map<string, string>();
    for (const g of groups || []) {
      const chat = (g?.zaloGroupId ?? '').trim();
      if (!chat) continue;
      for (const uid of g.memberUids || []) {
        uidToChat.set(uid, chat);
      }
    }

    const snap = await this.fs.collection(COL).get();
    await Promise.all(
      snap.docs.map((d) => {
        const zaloCtvGroupChatId = uidToChat.get(d.id) ?? null;
        return d.ref.set({ zaloCtvGroupChatId }, { merge: true });
      }),
    );
  }
}
