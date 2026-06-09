import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';

@Injectable()
export class ImagesService {
  /**
   * Upload file lên Firebase Storage (bucket mặc định) và trả public URL.
   */
  async upload(
    file: { buffer: Buffer; originalname: string; mimetype: string },
    path: string,
  ): Promise<string> {
    const bucket = admin.storage().bucket();
    const f = bucket.file(path);
    await f.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
        // Ảnh có tên path duy nhất → cache vĩnh viễn ở trình duyệt/CDN, lần sau
        // không tải lại (immutable). 1 năm = 31536000s.
        cacheControl: 'public, max-age=31536000, immutable',
      },
      resumable: false,
    });
    await f.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/${path}`;
  }

  /**
   * Xoá file theo URL. Hỗ trợ cả dạng public storage.googleapis.com và dạng
   * cũ firebasestorage.googleapis.com. Nuốt lỗi / no-op nếu không parse được.
   */
  async remove(url: string): Promise<void> {
    if (!url) return;
    const path = this.parsePath(url);
    if (!path) return;
    const bucket = admin.storage().bucket();
    await bucket
      .file(path)
      .delete({ ignoreNotFound: true } as any)
      .catch(() => {});
  }

  /** Trích storage path từ URL (2 định dạng), trả undefined nếu không hợp lệ. */
  private parsePath(url: string): string | undefined {
    try {
      const u = new URL(url);
      // Dạng cũ: https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<encodedPath>?...
      const oMatch = u.pathname.match(/\/o\/(.+)$/);
      if (oMatch) {
        return decodeURIComponent(oMatch[1]);
      }
      // Dạng public: https://storage.googleapis.com/<bucket>/<path>
      const parts = u.pathname.replace(/^\/+/, '').split('/');
      if (parts.length >= 2) {
        return decodeURIComponent(parts.slice(1).join('/'));
      }
      return undefined;
    } catch {
      return undefined;
    }
  }
}
