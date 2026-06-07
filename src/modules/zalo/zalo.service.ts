import { BadRequestException, Injectable } from '@nestjs/common';

const ZALO_ENDPOINT = {
  sendImageToGroup: '/zalo/sendImageToGroupZalo/2',
  sendMessToGroup: '/zalo/sendMessageToGroupZalo/2',
};
const ZALO_SENDER_NUMBER = '84776750418';

/**
 * Payload body của POST /zalo/send. Bao đủ mọi biến thể mà lớp gửi HTTP của FE
 * (sendZaloMessage / postTextToGroups / postImageToGroups) cần:
 * - message: nội dung text (bắt buộc cho mọi loại).
 * - groupIds: danh sách group đích. Nếu rỗng → dùng ZALO_MAIN_GROUP_ID từ env.
 * - image: tham số gửi kèm ảnh (caption + image_url) → dùng endpoint sendImage.
 */
export interface ZaloSendPayload {
  message: string;
  groupIds?: string[];
  image?: {
    caption: string;
    image_url: string[];
  };
}

@Injectable()
export class ZaloService {
  async send(payload: ZaloSendPayload): Promise<{ ok: true }> {
    const message = payload?.message ?? '';
    const baseUrl = String(process.env.ZALO_URL ?? '').trim();
    const shopCode = String(process.env.ZALO_SHOP_CODE ?? '').trim();
    const token = String(process.env.ZALO_TOKEN ?? '').trim();
    const mainGroupId = String(process.env.ZALO_MAIN_GROUP_ID ?? '').trim();

    if (!baseUrl || !shopCode || !token) {
      throw new BadRequestException('Zalo configuration is missing');
    }

    // Nếu FE không truyền groupIds (tương đương sendZaloMessage cũ) → group chính từ env.
    const groupIds =
      Array.isArray(payload?.groupIds) && payload.groupIds.length > 0
        ? payload.groupIds
        : [mainGroupId];

    const useImage =
      payload?.image &&
      Array.isArray(payload.image.image_url) &&
      payload.image.image_url.length > 0;

    const endpoint = useImage
      ? ZALO_ENDPOINT.sendImageToGroup
      : ZALO_ENDPOINT.sendMessToGroup;
    const url = `${baseUrl}${endpoint}/${shopCode}/${token}`;

    await Promise.all(
      groupIds.map(async (groupId) => {
        const body: Record<string, unknown> = {
          send_from_number: ZALO_SENDER_NUMBER,
          send_to_groupid: groupId,
          message,
        };
        if (useImage && payload.image) {
          body.caption = payload.image.caption;
          body.image_url = payload.image.image_url;
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          let detail = '';
          try {
            detail = await res.text();
          } catch {
            // ignore
          }
          throw new Error(`Zalo send failed (${res.status}): ${detail}`);
        }
      }),
    );

    return { ok: true };
  }
}
