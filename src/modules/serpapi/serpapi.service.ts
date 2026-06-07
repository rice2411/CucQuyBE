import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';

const SERPAPI_BASE = 'https://serpapi.com/search.json';

export interface SearchMapsParams {
  q?: string;
  ll?: string;
  type?: string;
  hl?: string;
  start?: number;
}

export interface GetDirectionsParams {
  startAddr?: string;
  endAddr?: string;
  startCoords?: string;
  endCoords?: string;
  travelMode?: number;
  distanceUnit?: number;
  hl?: string;
}

/**
 * Proxy gọi SerpApi (engine google_maps + google_maps_directions).
 * SerpApi không bật CORS nên FE không thể fetch trực tiếp → đi qua BE.
 * Key đọc từ process.env.SERPAPI_KEY.
 */
@Injectable()
export class SerpapiService {
  private async callSerpApi(params: URLSearchParams): Promise<any> {
    const resp = await fetch(`${SERPAPI_BASE}?${params.toString()}`);
    const text = await resp.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new InternalServerErrorException(
        `Non-JSON response: ${text.slice(0, 500)}`,
      );
    }
    if (!resp.ok) {
      throw new InternalServerErrorException(
        data?.error || `SerpApi ${resp.status}`,
      );
    }
    return data;
  }

  async searchMaps(input: SearchMapsParams): Promise<any> {
    const apiKey = process.env.SERPAPI_KEY;
    const q = input.q?.trim();
    if (!apiKey) throw new BadRequestException('Thiếu SerpApi API key');
    if (!q) throw new BadRequestException('Thiếu query (q)');

    const params = new URLSearchParams({
      engine: 'google_maps',
      api_key: apiKey,
      q,
      type: input.type || 'search',
      hl: input.hl || 'vi',
    });
    if (input.ll) params.set('ll', input.ll);
    if (input.start != null && !isNaN(input.start)) {
      params.set('start', String(input.start));
    }

    return this.callSerpApi(params);
  }

  async getDirections(input: GetDirectionsParams): Promise<any> {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) throw new BadRequestException('Thiếu SerpApi API key');

    const startAddr = input.startAddr || '';
    const endAddr = input.endAddr || '';
    const startCoords = input.startCoords || '';
    const endCoords = input.endCoords || '';
    const travelMode = Number(input.travelMode ?? 6);
    const distanceUnit = Number(input.distanceUnit ?? 0); // 0=km, 1=miles

    if (!(startAddr || startCoords) || !(endAddr || endCoords)) {
      throw new BadRequestException(
        'Cần ít nhất startAddr/startCoords và endAddr/endCoords',
      );
    }

    const params = new URLSearchParams({
      engine: 'google_maps_directions',
      api_key: apiKey,
      travel_mode: String(travelMode),
      distance_unit: String(distanceUnit),
      hl: input.hl || 'vi',
    });
    if (startAddr) params.set('start_addr', startAddr);
    if (endAddr) params.set('end_addr', endAddr);
    if (startCoords) params.set('start_coords', startCoords);
    if (endCoords) params.set('end_coords', endCoords);

    return this.callSerpApi(params);
  }
}
