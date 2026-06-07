import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { BillValidationResult, StockReceiptStructured } from './gemini.types';

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);

  private getClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY is not set in the environment.');
      return null;
    }
    return new GoogleGenAI({ apiKey });
  }

  private parseValidationJson(raw: string): BillValidationResult {
    let s = raw.trim();
    const fence = s.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
    if (fence) s = fence[1].trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(s) as Record<string, unknown>;
    } catch {
      throw new Error('Gemini trả lời kiểm tra bill không phải JSON hợp lệ. Thử lại.');
    }
    const isLikelyReceipt = Boolean(parsed.isLikelyReceipt ?? parsed.isLikelyPurchaseReceipt);
    const confidence =
      typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
    const reasonVi = typeof parsed.reasonVi === 'string' ? parsed.reasonVi : String(parsed.reason ?? '');
    return { isLikelyReceipt, confidence, reasonVi };
  }

  private parseStructuredJson(raw: string): StockReceiptStructured {
    let s = raw.trim();
    const fence = s.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
    if (fence) s = fence[1].trim();

    const parsed = JSON.parse(s) as Partial<StockReceiptStructured>;
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Gemini không trả về object JSON hợp lệ.');
    }
    if (!Array.isArray(parsed.lineItems)) parsed.lineItems = [];

    const normalizeStr = (v: unknown): string | null => {
      if (typeof v !== 'string') return null;
      const trimmed = v.trim();
      return trimmed ? trimmed : null;
    };

    parsed.supplierPhone = normalizeStr(parsed.supplierPhone);
    parsed.supplierAddress = normalizeStr(parsed.supplierAddress);
    parsed.invoiceNumber = normalizeStr(parsed.invoiceNumber);

    if (parsed.supplierPhone) {
      const onlyDigitsPlus = parsed.supplierPhone.replace(/[\s.\-()]/g, '');
      parsed.supplierPhone = /^\+?\d{8,15}$/.test(onlyDigitsPlus)
        ? onlyDigitsPlus
        : parsed.supplierPhone;
    }

    return parsed as StockReceiptStructured;
  }

  async validateReceipt(ocrText: string): Promise<BillValidationResult> {
    const ai = this.getClient();
    if (!ai) throw new Error('Thiếu GEMINI_API_KEY trong môi trường.');

    const snippet = ocrText.slice(0, 8000);
    const prompt = `Bạn kiểm tra nội dung OCR có phải chứng từ MUA HÀNG / BÁN HÀNG (hoá đơn, phiếu tính tiền, biên lai siêu thị, phiếu NCC, phiếu bán lẻ của shop…) hay không.

Trả về DUY NHẤT JSON (không markdown):
{"isLikelyReceipt": boolean, "confidence": number từ 0 đến 1, "reasonVi": string ngắn (tối đa 2 câu, tiếng Việt)}

HỢP LỆ — confidence >= 0.6, kể cả khi ảnh bị cắt mất phần dưới hoặc thiếu tổng tiền:
- Có TIÊU ĐỀ tiêu biểu: "HÓA ĐƠN BÁN HÀNG", "HÓA ĐƠN GTGT", "HOÁ ĐƠN", "Phiếu tính tiền", "Phiếu thu", "Biên lai", "Receipt", "Invoice".
- HOẶC có >= 1 mặt hàng + giá / số lượng (cột SL, ĐG, Thành tiền, Đơn giá…).
- HOẶC có cụm "Khách phải trả", "Tổng tiền hàng", "Tổng cộng", "Ngày bán", "Ngày lập".
- Phiếu nhỏ của shop tự in (chỉ vài dòng) VẪN hợp lệ — đừng đòi đầy đủ trường.

KHÔNG HỢP LỆ — confidence < 0.3:
- Ảnh chân dung / selfie / phong cảnh / sản phẩm rời.
- Menu nhà hàng / catalogue không có giá.
- Screenshot chat, bài báo, danh thiếp, slide, meme.
- Màn hình app không liên quan thanh toán.

Khi không chắc nhưng có dấu hiệu giống bill (chữ số tiền + tên sản phẩm) → confidence ~ 0.5–0.6, isLikelyReceipt = true, không reject vội.

OCR:
"""
${snippet}
"""`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text?.trim();
    if (!text) throw new Error('Gemini không trả lời khi kiểm tra bill.');
    return this.parseValidationJson(text);
  }

  async structureStockReceipt(ocrText: string): Promise<StockReceiptStructured> {
    const ai = this.getClient();
    if (!ai) throw new Error('Thiếu GEMINI_API_KEY trong môi trường.');

    const prompt = `${STRUCTURE_PROMPT_VI}
"""
${ocrText.slice(0, 12000)}
"""`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text?.trim();
    if (!text) throw new Error('Gemini không trả lời nội dung.');
    return this.parseStructuredJson(text);
  }
}

const STRUCTURE_PROMPT_VI = `Bạn là trợ lý kế toán kho. Nhiệm vụ: làm sạch và cấu trúc hoá dữ liệu từ chữ đã OCR của một hoá đơn/phiếu mua hàng (nhập hàng).

Quy tắc chung:
- Trả về DUY NHẤT một JSON hợp lệ, không markdown, không giải thích.
- Số tiền: số thuần (number), không chuỗi. Không chắc thì null.
- Ngày: ưu tiên yyyy-mm-dd; nếu chỉ có dd/mm/yyyy hãy chuyển sang yyyy-mm-dd; không đoán bừa thì null.
- productLineCount = số dòng mặt hàng (sản phẩm) bạn trích được.
- currency: mặc định "VND" nếu bill VN.
- lineItems: mỗi phần tử có name (bắt buộc), quantity, unit (kg, thùng, chai...), unitPrice, lineTotal.

QUY TẮC TRÍCH XUẤT THÔNG TIN NCC (BẮT BUỘC CỐ GẮNG):

1) supplierPhone — số điện thoại của NCC / cửa hàng (không phải SĐT khách).
   - Bắt sau các nhãn: "ĐT", "Đ.T", "SĐT", "Điện thoại", "Tel", "Tel.", "Phone",
     "Hotline", "Liên hệ", "DT", "MB" (di động), "Mobile", "Fax" (không lấy fax).
   - Pattern VN: bắt đầu 0|+84 + 9–10 chữ số. Có thể có dấu cách / chấm / gạch.
   - Chuẩn hoá: bỏ ký tự ".-() " để chỉ còn chữ số + dấu "+" đầu nếu có.
   - Nếu có nhiều SĐT, lấy SĐT đầu tiên ở phần header của bill.

2) supplierAddress — địa chỉ NCC (KHÁC với "storeOrBranch" là tên chi nhánh).
   - Bắt sau các nhãn: "Địa chỉ", "Đ/C", "ĐC", "Address", "Add", "Tại", "Trụ sở".
   - Lấy nguyên 1 dòng địa chỉ (gộp tối đa 2 dòng nếu có "Số nhà / đường" và "Phường/Quận/TP" tách dòng).
   - Bỏ chấm/dấu hai chấm sau nhãn.

3) invoiceNumber — mã / số hoá đơn (mã chứng từ).
   - Bắt sau các nhãn: "Số HĐ", "Số hoá đơn", "Hoá đơn số", "HĐGTGT", "Mã HĐ",
     "Số phiếu", "Phiếu số", "No.", "No:", "Number", "Mẫu số" (lấy phần "Ký hiệu" cùng số).
   - Có thể dạng: HD-12345, HĐ 00001234, 00012345, 2C24TPB/000123, B-2024-00045…
   - Giữ nguyên định dạng gốc, viết HOA chữ cái.
   - Nếu chỉ có ngày + thời gian mà không có số riêng, để null.

4) supplierName: lấy đoạn TÊN ngắn (công ty / siêu thị / cửa hàng) — KHÔNG đính kèm địa chỉ/SĐT.

5) storeOrBranch: dùng cho tên chi nhánh ("Chi nhánh Q.10", "CN Hà Đông"…) — KHÔNG dùng cho địa chỉ.

Schema JSON (bám sát các key sau):
{
  "supplierName": string | null,
  "supplierPhone": string | null,
  "supplierAddress": string | null,
  "invoiceNumber": string | null,
  "storeOrBranch": string | null,
  "receiptDate": string | null,
  "receiptTime": string | null,
  "lineItems": [{ "name": string, "quantity": number | null, "unit": string | null, "unitPrice": number | null, "lineTotal": number | null }],
  "productLineCount": number,
  "subtotal": number | null,
  "tax": number | null,
  "discount": number | null,
  "totalAmount": number | null,
  "currency": string,
  "paymentMethod": string | null,
  "notes": string | null
}

Nội dung OCR:
`;
