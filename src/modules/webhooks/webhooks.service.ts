import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirestoreService } from '../../firebase/firestore.service';

const PAYMENT_STATUS_PAID = 'PAID';
const FB_COLLECTION = 'facebook_messages';

/** Trích mã đơn ORD-XXXXXX từ chuỗi tự do. */
const extractFormattedOrderCode = (str: string | null | undefined): string | null => {
  const match = (str || '').match(/ORD\d+/);
  return match ? match[0].replace(/ORD(\d+)/, 'ORD-$1') : null;
};

@Injectable()
export class WebhooksService {
  constructor(private readonly fs: FirestoreService) {}

  /** SePay: lưu transaction + (nếu khớp orderNumber) set order = PAID. */
  async handleSepay(body: any): Promise<{ status: number; payload: Record<string, unknown> }> {
    if (!body || !body.id) {
      return { status: 400, payload: { error: 'Invalid webhook data' } };
    }

    // Chống trùng: SePay có thể gửi lặp / BullMQ retry → không tạo transaction 2 lần.
    const dup = await this.fs
      .collection('transactions')
      .where('sepayId', '==', body.id)
      .limit(1)
      .get();
    if (!dup.empty) {
      return {
        status: 200,
        payload: { success: true, duplicate: true, transactionId: body.id },
      };
    }

    const orderNumber = extractFormattedOrderCode(body.description);
    const now = admin.firestore.Timestamp.now();

    await this.fs.collection('transactions').add({
      sepayId: body.id,
      gateway: body.gateway || '',
      transactionDate: body.transactionDate || '',
      accountNumber: body.accountNumber || '',
      code: body.code || null,
      content: body.content || '',
      transferType: body.transferType || 'in',
      transferAmount: Number(body.transferAmount) || 0,
      accumulated: Number(body.accumulated) || 0,
      subAccount: body.subAccount || null,
      referenceCode: body.referenceCode || '',
      description: body.description || '',
      receivedAt: now,
      createdAt: now,
      orderNumber,
    });

    const snapshot = await this.fs
      .collection('orders')
      .where('orderNumber', '==', orderNumber)
      .get();

    if (snapshot.empty) {
      return {
        status: 200,
        payload: {
          success: true,
          message: 'Transaction saved but no matching order',
          transactionId: body.id,
        },
      };
    }

    await snapshot.docs[0].ref.update({
      paymentStatus: PAYMENT_STATUS_PAID,
      sepayId: body.id,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    return {
      status: 200,
      payload: { success: true, message: 'Webhook received', transactionId: body.id },
    };
  }

  /** Facebook/Fanpage inbox: lưu message, idempotent theo idNewMessage. */
  async handleFacebook(body: any): Promise<{ status: number; payload: Record<string, unknown> }> {
    const idNewMessage =
      typeof body?.id_new_message === 'string' ? body.id_new_message.trim() : '';
    if (!body || !idNewMessage) {
      return {
        status: 400,
        payload: { error: 'Invalid webhook data: id_new_message is required' },
      };
    }

    const existing = await this.fs
      .collection(FB_COLLECTION)
      .where('idNewMessage', '==', idNewMessage)
      .limit(1)
      .get();

    if (!existing.empty) {
      return {
        status: 200,
        payload: {
          success: true,
          duplicate: true,
          message: 'Message already stored',
          id_new_message: idNewMessage,
          docId: existing.docs[0].id,
        },
      };
    }

    const sourceCreatedAt =
      body.create_at != null && String(body.create_at).trim() !== ''
        ? String(body.create_at).trim()
        : null;
    const now = admin.firestore.Timestamp.now();

    const docRef = await this.fs.collection(FB_COLLECTION).add({
      idNewMessage,
      idPage: String(body.id_page ?? ''),
      pageScopeId: String(body.page_scopeid ?? ''),
      idConversion: String(body.id_conversion ?? ''),
      idCongTy: Number(body.idcongty) || 0,
      message: String(body.message ?? ''),
      type: Number(body.type) || 0,
      isPhone: Number(body.is_phone) || 0,
      useWebhook: Number(body.use_webhook) || 0,
      urlWebhook: String(body.url_webhook ?? ''),
      appId: body.app_id ?? null,
      pageName: String(body.page_name ?? ''),
      customerName: String(body.customer_name ?? ''),
      numberPhone: String(body.number_phone ?? ''),
      countryCode: String(body.country_code ?? ''),
      sentByShop: Number(body.sent_by_shop) || 0,
      aiDisabled: Boolean(body.ai_disabled),
      attachment: Array.isArray(body.attachment) ? body.attachment : [],
      content:
        body.content && typeof body.content === 'object'
          ? body.content
          : { type: '', data: [] },
      sourceCreatedAt,
      receivedAt: now,
      createdAt: now,
    });

    return {
      status: 200,
      payload: {
        success: true,
        duplicate: false,
        message: 'Webhook received',
        id_new_message: idNewMessage,
        docId: docRef.id,
      },
    };
  }
}
