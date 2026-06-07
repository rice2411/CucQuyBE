import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirestoreService } from '../../firebase/firestore.service';
import { UserRole } from '../../auth/user.types';
import {
  DEFAULT_SHIPPING_CONFIG,
  SaveZaloGroupsPayload,
  ScreenConfiguration,
  ScreenVisibilityMap,
  ShippingConfiguration,
  ShippingTier,
  ZaloGroupConfig,
  ZaloGroupsConfiguration,
} from './configurations.types';

const CONFIG_COLLECTION = 'configurations';
const SCREEN_CONFIG_DOC = 'screen-visibility';
const ZALO_CONFIG_DOC = 'zalo-configuration';
const SHIPPING_CONFIG_DOC = 'shipping-configuration';
const USERS_COLLECTION = 'users';

const toIso = (v: unknown): string | undefined => {
  const ts = v as { toDate?: () => Date } | undefined;
  if (ts && typeof ts.toDate === 'function') return ts.toDate().toISOString();
  return undefined;
};

const asBool = (v: unknown, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback;

const sanitizeStringArray = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === 'string' && s.length > 0);
};

@Injectable()
export class ConfigurationsService {
  constructor(private readonly fs: FirestoreService) {}

  private docRef(docId: string) {
    return this.fs.collection(CONFIG_COLLECTION).doc(docId);
  }

  // ==================== SCREEN ====================

  private sanitizeVisibility(value: unknown): ScreenVisibilityMap {
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([path, enabled]) => [
        path,
        enabled !== false,
      ]),
    );
  }

  async fetchScreenConfiguration(): Promise<ScreenConfiguration> {
    const snap = await this.docRef(SCREEN_CONFIG_DOC).get();
    if (!snap.exists) return { screenVisibility: {} };
    const data = snap.data() ?? {};
    return {
      screenVisibility: this.sanitizeVisibility(data.screenVisibility),
      updatedAt: toIso(data.updatedAt),
      updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : undefined,
    };
  }

  async saveScreenConfiguration(
    screenVisibility: unknown,
    updatedBy?: string,
  ): Promise<ScreenConfiguration> {
    const sanitized = this.sanitizeVisibility(screenVisibility);
    await this.docRef(SCREEN_CONFIG_DOC).set(
      {
        screenVisibility: sanitized,
        updatedBy: updatedBy || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return this.fetchScreenConfiguration();
  }

  // ==================== ZALO GROUPS ====================

  private sanitizeZaloGroups(raw: unknown): ZaloGroupConfig[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item): item is object => item != null && typeof item === 'object')
      .map((item) => {
        const o = item as Record<string, unknown>;
        const id =
          typeof o.id === 'string' && o.id ? o.id : admin.firestore().collection('_').doc().id;
        const name = typeof o.name === 'string' ? o.name : '';
        const zaloGroupId = typeof o.zaloGroupId === 'string' ? o.zaloGroupId : '';
        const memberUids = Array.isArray(o.memberUids)
          ? o.memberUids.filter((u): u is string => typeof u === 'string' && u.length > 0)
          : [];
        return {
          id,
          name,
          zaloGroupId,
          memberUids,
          notifyOnCreate: asBool(o.notifyOnCreate, true),
          notifyOnUpdate: asBool(o.notifyOnUpdate, true),
          notifyOnDelete: asBool(o.notifyOnDelete, true),
          updateFieldWhitelist: sanitizeStringArray(o.updateFieldWhitelist),
        };
      });
  }

  async fetchZaloGroupsConfiguration(): Promise<ZaloGroupsConfiguration> {
    const snap = await this.docRef(ZALO_CONFIG_DOC).get();
    if (!snap.exists) return { groups: [] };
    const data = snap.data() ?? {};
    return {
      groups: this.sanitizeZaloGroups(data.groups),
      mainGroupId: typeof data.mainGroupId === 'string' ? data.mainGroupId.trim() : '',
      mainNotifyOnCreate: asBool(data.mainNotifyOnCreate, true),
      mainNotifyOnUpdate: asBool(data.mainNotifyOnUpdate, true),
      mainNotifyOnDelete: asBool(data.mainNotifyOnDelete, true),
      mainUpdateFieldWhitelist: sanitizeStringArray(data.mainUpdateFieldWhitelist),
      updatedAt: toIso(data.updatedAt),
      updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : null,
    };
  }

  /** Ghi zaloCtvGroupChatId lên từng user doc theo membership (clear khi không thuộc group nào). */
  private async syncZaloCtvGroupFieldsFromGroups(groups: ZaloGroupConfig[]): Promise<void> {
    const uidToChat = new Map<string, string>();
    for (const g of groups) {
      const chat = g.zaloGroupId.trim();
      if (!chat) continue;
      for (const uid of g.memberUids) uidToChat.set(uid, chat);
    }

    const usersRef = this.fs.collection(USERS_COLLECTION);
    const snapshot = await usersRef.get();
    await Promise.all(
      snapshot.docs.map((d) => {
        const zaloCtvGroupChatId = uidToChat.get(d.id) ?? null;
        return usersRef.doc(d.id).set({ zaloCtvGroupChatId }, { merge: true });
      }),
    );
  }

  async saveZaloGroupsConfiguration(
    payload: SaveZaloGroupsPayload,
    updatedBy?: string | null,
  ): Promise<ZaloGroupsConfiguration> {
    const groups = this.sanitizeZaloGroups(payload?.groups);
    const data: Record<string, unknown> = {
      groups,
      updatedBy: updatedBy ?? null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (payload?.mainGroupId !== undefined) data.mainGroupId = String(payload.mainGroupId).trim();
    if (payload?.mainNotifyOnCreate !== undefined)
      data.mainNotifyOnCreate = payload.mainNotifyOnCreate;
    if (payload?.mainNotifyOnUpdate !== undefined)
      data.mainNotifyOnUpdate = payload.mainNotifyOnUpdate;
    if (payload?.mainNotifyOnDelete !== undefined)
      data.mainNotifyOnDelete = payload.mainNotifyOnDelete;
    if (payload?.mainUpdateFieldWhitelist !== undefined)
      data.mainUpdateFieldWhitelist = sanitizeStringArray(payload.mainUpdateFieldWhitelist);

    await this.docRef(ZALO_CONFIG_DOC).set(data, { merge: true });
    await this.syncZaloCtvGroupFieldsFromGroups(groups);
    return this.fetchZaloGroupsConfiguration();
  }

  /**
   * CTV có thuộc 1 nhóm Zalo nào không (để chặn tạo đơn khi chưa gán nhóm).
   * Non-CTV / không tìm thấy user → coi như hợp lệ (true).
   */
  async collaboratorHasZaloGroup(uid: string): Promise<boolean> {
    if (!uid) return true;
    const userSnap = await this.fs.collection(USERS_COLLECTION).doc(uid).get();
    if (!userSnap.exists) return true;
    const user = userSnap.data() ?? {};
    if (user.role !== UserRole.COLABORATOR) return true;
    if (typeof user.zaloCtvGroupChatId === 'string' && user.zaloCtvGroupChatId.trim()) return true;
    const { groups } = await this.fetchZaloGroupsConfiguration();
    return groups.some((g) => g.zaloGroupId.trim() && g.memberUids.includes(uid));
  }

  // ==================== SHIPPING ====================

  private sanitizeShippingTiers(raw: unknown): ShippingTier[] {
    if (!Array.isArray(raw)) return DEFAULT_SHIPPING_CONFIG.tiers;
    const cleaned = raw
      .filter((t): t is object => t != null && typeof t === 'object')
      .map((t) => {
        const o = t as Record<string, unknown>;
        const maxKm = typeof o.maxKm === 'number' && o.maxKm > 0 ? o.maxKm : 0;
        const fee = typeof o.fee === 'number' && o.fee >= 0 ? o.fee : 0;
        const label = typeof o.label === 'string' && o.label ? o.label : `< ${maxKm} km`;
        return { maxKm, fee, label };
      })
      .filter((t) => t.maxKm > 0);
    return cleaned.length > 0 ? cleaned.sort((a, b) => a.maxKm - b.maxKm) : DEFAULT_SHIPPING_CONFIG.tiers;
  }

  private sanitizeShippingConfig(data: any): ShippingConfiguration {
    const origin = data?.shopOrigin && typeof data.shopOrigin === 'object' ? data.shopOrigin : {};
    return {
      shopOrigin: {
        name:
          typeof origin.name === 'string' && origin.name
            ? origin.name
            : DEFAULT_SHIPPING_CONFIG.shopOrigin.name,
        lat: typeof origin.lat === 'number' ? origin.lat : DEFAULT_SHIPPING_CONFIG.shopOrigin.lat,
        lng: typeof origin.lng === 'number' ? origin.lng : DEFAULT_SHIPPING_CONFIG.shopOrigin.lng,
        city:
          typeof origin.city === 'string' && origin.city
            ? origin.city
            : DEFAULT_SHIPPING_CONFIG.shopOrigin.city,
      },
      tiers: this.sanitizeShippingTiers(data?.tiers),
      overFee:
        typeof data?.overFee === 'number' && data.overFee >= 0
          ? data.overFee
          : DEFAULT_SHIPPING_CONFIG.overFee,
      overLabel:
        typeof data?.overLabel === 'string' && data.overLabel
          ? data.overLabel
          : DEFAULT_SHIPPING_CONFIG.overLabel,
      updatedAt: toIso(data?.updatedAt),
      updatedBy: data?.updatedBy ?? null,
    };
  }

  async fetchShippingConfiguration(): Promise<ShippingConfiguration> {
    const snap = await this.docRef(SHIPPING_CONFIG_DOC).get();
    if (!snap.exists) return DEFAULT_SHIPPING_CONFIG;
    return this.sanitizeShippingConfig(snap.data());
  }

  async saveShippingConfiguration(
    config: ShippingConfiguration,
    updatedBy?: string | null,
  ): Promise<ShippingConfiguration> {
    const sanitized = this.sanitizeShippingConfig(config);
    await this.docRef(SHIPPING_CONFIG_DOC).set(
      {
        shopOrigin: sanitized.shopOrigin,
        tiers: sanitized.tiers,
        overFee: sanitized.overFee,
        overLabel: sanitized.overLabel,
        updatedBy: updatedBy ?? null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return this.fetchShippingConfiguration();
  }
}
