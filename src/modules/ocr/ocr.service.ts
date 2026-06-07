import { Injectable } from '@nestjs/common';

const VISION_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

@Injectable()
export class OcrService {
  private getVisionApiKey(): string {
    const k = String(process.env.VISION_API_KEY ?? '').trim();
    if (!k) throw new Error('Thiếu VISION_API_KEY trong môi trường (.env).');
    return k;
  }

  /**
   * `content`: base64 thuần (không có prefix data:image/...).
   */
  async extractText(content: string): Promise<string> {
    const key = this.getVisionApiKey();
    const res = await fetch(`${VISION_ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Vision API lỗi ${res.status}: ${errBody.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      responses?: Array<{
        fullTextAnnotation?: { text?: string };
        textAnnotations?: Array<{ description?: string }>;
        error?: { message?: string };
      }>;
    };

    const first = data.responses?.[0];
    if (first?.error?.message) {
      throw new Error(`Vision: ${first.error.message}`);
    }

    const fromDoc = first?.fullTextAnnotation?.text?.trim();
    if (fromDoc) return fromDoc;

    const fallback = first?.textAnnotations?.[0]?.description?.trim();
    return fallback || '';
  }
}
