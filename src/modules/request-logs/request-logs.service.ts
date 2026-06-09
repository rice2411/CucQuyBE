import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirestoreService } from '../../firebase/firestore.service';

const COL = 'request_logs';

/** Số ngày giữ log trước khi TTL Firestore tự xoá. */
export const RETENTION_DAYS = 30;

/** Trần số doc đọc khi tính thống kê (tránh đọc cả collection tốn chi phí). */
const STATS_SCAN_CAP = 2000;

export interface GeoInfo {
  country?: string;
  region?: string;
  city?: string;
  lat?: number;
  lng?: number;
}

/** 1 bản ghi request ghi vào Firestore (chưa kèm timestamp/expireAt). */
export interface RequestLogEntry {
  method: string;
  path: string;
  query: string; // chuỗi query (vd "?status=paid"), '' nếu không có
  statusCode: number;
  durationMs: number;
  responseSize: number | null; // content-length nếu có
  ip: string;
  geo: GeoInfo | null;
  uid: string | null;
  email: string | null;
  role: string | null;
  userAgent: string;
  referer: string | null;
  body: string | null; // payload đã redact + cắt bớt (chỉ method có body)
}

export interface QueryLogsParams {
  from?: string; // ISO date
  to?: string; // ISO date
  method?: string;
  status?: number;
  uid?: string;
  email?: string;
  ip?: string;
  page?: number; // 1-based
  limit?: number;
}

@Injectable()
export class RequestLogsService {
  private readonly logger = new Logger(RequestLogsService.name);

  constructor(private readonly fs: FirestoreService) {}

  /**
   * Ghi log (fire-and-forget). KHÔNG throw ra ngoài — lỗi log không được làm
   * hỏng response. Gọi không cần await trong middleware.
   */
  async writeLog(entry: RequestLogEntry): Promise<void> {
    try {
      const now = admin.firestore.Timestamp.now();
      const expireAt = admin.firestore.Timestamp.fromMillis(
        now.toMillis() + RETENTION_DAYS * 24 * 60 * 60 * 1000,
      );
      await this.fs.collection(COL).add({ ...entry, timestamp: now, expireAt });
    } catch (err) {
      this.logger.error(`Ghi request log thất bại: ${String(err)}`);
    }
  }

  /** Danh sách log có lọc + phân trang (offset). orderBy timestamp desc. */
  async queryLogs(params: QueryLogsParams): Promise<{
    items: Array<Record<string, unknown>>;
    page: number;
    limit: number;
    hasMore: boolean;
  }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(200, Math.max(1, params.limit ?? 50));

    let q: admin.firestore.Query = this.fs.collection(COL);
    if (params.from) q = q.where('timestamp', '>=', this.toTs(params.from));
    if (params.to) q = q.where('timestamp', '<=', this.toTs(params.to));
    if (params.method) q = q.where('method', '==', params.method.toUpperCase());
    if (typeof params.status === 'number') q = q.where('statusCode', '==', params.status);
    if (params.uid) q = q.where('uid', '==', params.uid);
    if (params.email) q = q.where('email', '==', params.email);
    if (params.ip) q = q.where('ip', '==', params.ip);

    q = q.orderBy('timestamp', 'desc');

    // Lấy dư 1 doc để biết còn trang sau không.
    const snap = await q
      .offset((page - 1) * limit)
      .limit(limit + 1)
      .get();

    const docs = snap.docs;
    const hasMore = docs.length > limit;
    const items = docs.slice(0, limit).map((d) => ({ id: d.id, ...d.data() }));
    return { items, page, limit, hasMore };
  }

  /**
   * Thống kê nhanh trên cửa sổ gần nhất (tối đa STATS_SCAN_CAP doc trong khoảng
   * thời gian lọc). Trả kèm `scanned` để minh bạch số doc đã quét.
   */
  async stats(params: Pick<QueryLogsParams, 'from' | 'to'>): Promise<{
    scanned: number;
    total: number;
    errorCount: number;
    uniqueIps: number;
    topPaths: Array<{ path: string; count: number }>;
    topIps: Array<{ ip: string; country?: string; count: number }>;
  }> {
    let q: admin.firestore.Query = this.fs.collection(COL);
    if (params.from) q = q.where('timestamp', '>=', this.toTs(params.from));
    if (params.to) q = q.where('timestamp', '<=', this.toTs(params.to));
    q = q.orderBy('timestamp', 'desc').limit(STATS_SCAN_CAP);

    const snap = await q.get();
    const rows = snap.docs.map((d) => d.data() as Record<string, unknown>);

    const ips = new Set<string>();
    let errorCount = 0;
    const pathCount = new Map<string, number>();
    const ipCount = new Map<string, { count: number; country?: string }>();

    for (const r of rows) {
      const ip = typeof r.ip === 'string' ? r.ip : 'unknown';
      const path = typeof r.path === 'string' ? r.path : 'unknown';
      const status = typeof r.statusCode === 'number' ? r.statusCode : 0;
      const country = (r.geo as GeoInfo | null)?.country;
      ips.add(ip);
      if (status >= 400) errorCount++;
      pathCount.set(path, (pathCount.get(path) ?? 0) + 1);
      const cur = ipCount.get(ip) ?? { count: 0, country };
      cur.count++;
      ipCount.set(ip, cur);
    }

    const topPaths = [...pathCount.entries()]
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    const topIps = [...ipCount.entries()]
      .map(([ip, v]) => ({ ip, country: v.country, count: v.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      scanned: rows.length,
      total: rows.length,
      errorCount,
      uniqueIps: ips.size,
      topPaths,
      topIps,
    };
  }

  private toTs(iso: string): admin.firestore.Timestamp {
    return admin.firestore.Timestamp.fromDate(new Date(iso));
  }
}
