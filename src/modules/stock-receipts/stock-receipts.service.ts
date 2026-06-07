import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import { FirestoreService } from '../../firebase/firestore.service';
import {
  BillLineItem,
  ImportedMaterialSummary,
  ImportedSupplierSummary,
  MaterialPriceOption,
  SavedStockReceiptDetail,
  SavedStockReceiptSummary,
  SaveStockReceiptDraftInput,
  StockReceiptStructured,
  StockReceiptValidationSnapshot,
  SupplierContactInfo,
} from './stock-receipts.types';

const RECEIPTS_COLLECTION = 'stock_receipts';
const LINES_SUBCOLLECTION = 'lines';
const SUPPLIERS_COLLECTION = 'suppliers';
const MATERIALS_COLLECTION = 'materials';
const BATCH_LIMIT_SAFE = 480;

type DocRef = admin.firestore.DocumentReference;
type Timestamp = admin.firestore.Timestamp;
const Ts = admin.firestore.Timestamp;
const FieldValue = admin.firestore.FieldValue;
const serverTimestamp = () => FieldValue.serverTimestamp();
const increment = (n: number) => FieldValue.increment(n);

// ── Helpers chuẩn hoá (port từ frontend/utils/data/normalize.ts) ───────────

const ACCENT_RE = /[̀-ͯ]/g;

function stripAccent(input: string): string {
  return input.toLowerCase().normalize('NFD').replace(ACCENT_RE, '');
}

const UNIT_TOKEN =
  /(\d+(?:[.,]\d+)?)\s*(kg|kilogam|kilo|gam|gr|g|l|lit|lít|ml|cl|goi|gói|hop|hộp|chai|thung|thùng|lon|cai|cái|cay|cây|tui|túi|bich|bịch|qua|quả)\b/i;

const UNIT_CANONICAL_MAP: Record<string, string> = {
  ki: 'kg', kilo: 'kg', kilogam: 'kg', kg: 'kg',
  gam: 'g', gr: 'g', g: 'g',
  lit: 'l', l: 'l',
  ml: 'ml', cl: 'cl',
  thung: 'thung',
  chai: 'chai',
  lon: 'lon',
  goi: 'goi',
  hop: 'hop',
  cai: 'cai',
  cay: 'cay',
  tui: 'tui',
  bich: 'tui',
  qua: 'qua',
};

function canonicalUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = stripAccent(raw.trim());
  if (!s) return null;
  const onlyUnit = s.replace(/^\d+(?:[.,]\d+)?\s*/, '').trim();
  return UNIT_CANONICAL_MAP[onlyUnit] ?? UNIT_CANONICAL_MAP[s] ?? null;
}

interface NormalizedItem {
  base: string;
  pack: string | null;
  fullKey: string;
}

function normalizeItem(raw: string): NormalizedItem {
  const cleaned = stripAccent(raw || '');
  const m = cleaned.match(UNIT_TOKEN);
  let pack: string | null = null;
  if (m) {
    const num = m[1].replace(',', '.');
    const unit = UNIT_CANONICAL_MAP[m[2].toLowerCase()] ?? m[2].toLowerCase();
    pack = `${num}${unit}`;
  }
  const base = cleaned
    .replace(UNIT_TOKEN, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const fullKey = pack ? `${base}|${pack}` : base;
  return { base, pack, fullKey };
}

function normalizeSupplierKey(raw: string | null | undefined): string {
  const s = stripAccent((raw || '').trim());
  return s.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

// ── Helpers nội bộ ─────────────────────────────────────────────────────────

const toNumberOrNull = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
};

const toStringOrNull = (v: unknown): string | null => {
  if (typeof v === 'string') {
    const s = v.trim();
    return s || null;
  }
  return null;
};

const normalizeLine = (raw: unknown): BillLineItem | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!name) return null;
  return {
    name,
    quantity: toNumberOrNull(r.quantity),
    unit: toStringOrNull(r.unit),
    unitPrice: toNumberOrNull(r.unitPrice),
    lineTotal: toNumberOrNull(r.lineTotal),
  };
};

const nowIso = () => new Date().toISOString();

function cleanContact(input?: SupplierContactInfo | null): SupplierContactInfo {
  if (!input) return {};
  const out: SupplierContactInfo = {};
  (Object.keys(input) as Array<keyof SupplierContactInfo>).forEach((k) => {
    const v = input[k];
    if (typeof v === 'string') {
      const s = v.trim();
      if (s) (out as Record<string, string>)[k] = s;
    }
  });
  return out;
}

/** Hàm thuần — không chạm Firestore. */
export function computeAmountCheck(structured: StockReceiptStructured): {
  sumLines: number;
  totalAmount: number | null;
  deltaPct: number;
  warn: boolean;
} {
  const sumLines = (structured.lineItems || []).reduce((s, l) => {
    const lt = typeof l.lineTotal === 'number' ? l.lineTotal : 0;
    return s + lt;
  }, 0);
  const totalAmount = typeof structured.totalAmount === 'number' ? structured.totalAmount : null;
  const deltaPct =
    totalAmount && totalAmount > 0 ? Math.abs(sumLines - totalAmount) / totalAmount : 0;
  return { sumLines, totalAmount, deltaPct, warn: deltaPct > 0.02 };
}

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

@Injectable()
export class StockReceiptsService {
  constructor(private readonly fs: FirestoreService) {}

  private get db(): admin.firestore.Firestore {
    return this.fs.firestore;
  }

  // ── ĐỌC (type-guard mọi field) ───────────────────────────────────────────

  async fetchImportedSuppliers(): Promise<ImportedSupplierSummary[]> {
    const snap = await this.db
      .collection(SUPPLIERS_COLLECTION)
      .orderBy('updatedAt', 'desc')
      .get();
    return snap.docs.map((d) => {
      const raw = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        name: typeof raw.name === 'string' ? raw.name : '(Unknown)',
        normalizedName: typeof raw.normalizedName === 'string' ? raw.normalizedName : '',
        receiptCount: typeof raw.receiptCount === 'number' ? raw.receiptCount : 0,
        totalAmount: typeof raw.totalAmount === 'number' ? raw.totalAmount : 0,
        lastReceiptDate: typeof raw.lastReceiptDate === 'string' ? raw.lastReceiptDate : undefined,
        phone: typeof raw.phone === 'string' ? raw.phone : null,
        address: typeof raw.address === 'string' ? raw.address : null,
        contactPerson: typeof raw.contactPerson === 'string' ? raw.contactPerson : null,
        email: typeof raw.email === 'string' ? raw.email : null,
        taxCode: typeof raw.taxCode === 'string' ? raw.taxCode : null,
        category: typeof raw.category === 'string' ? raw.category : null,
        notes: typeof raw.notes === 'string' ? raw.notes : null,
      };
    });
  }

  async fetchImportedMaterials(): Promise<ImportedMaterialSummary[]> {
    const snap = await this.db
      .collection(MATERIALS_COLLECTION)
      .orderBy('updatedAt', 'desc')
      .get();
    return snap.docs.map((d) => {
      const raw = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        name: typeof raw.name === 'string' ? raw.name : '(Unknown)',
        normalizedName: typeof raw.normalizedName === 'string' ? raw.normalizedName : '',
        importCount: typeof raw.importCount === 'number' ? raw.importCount : 0,
        totalQty: typeof raw.totalQty === 'number' ? raw.totalQty : 0,
        totalAmount: typeof raw.totalAmount === 'number' ? raw.totalAmount : 0,
        lastSupplierName:
          typeof raw.lastSupplierName === 'string' ? raw.lastSupplierName : undefined,
        lastReceiptDate: typeof raw.lastReceiptDate === 'string' ? raw.lastReceiptDate : undefined,
      };
    });
  }

  async fetchMaterialPriceOptions(): Promise<MaterialPriceOption[]> {
    const materials = await this.fetchImportedMaterials();
    return materials
      .map((m) => ({
        id: m.id,
        name: m.name,
        unitPrice: m.totalQty > 0 ? Math.round(m.totalAmount / m.totalQty) : 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }

  async fetchStockReceiptSummaries(): Promise<SavedStockReceiptSummary[]> {
    const snap = await this.db
      .collection(RECEIPTS_COLLECTION)
      .orderBy('createdAt', 'desc')
      .get();
    return snap.docs.map((d) => {
      const raw = d.data() as Record<string, unknown>;
      const createdTs = raw.createdAt instanceof Ts ? (raw.createdAt as Timestamp) : null;
      const updatedTs = raw.updatedAt instanceof Ts ? (raw.updatedAt as Timestamp) : null;
      const importedAt = createdTs ?? updatedTs;
      return {
        id: d.id,
        supplierNameRaw: toStringOrNull(raw.supplierNameRaw),
        storeOrBranch: toStringOrNull(raw.storeOrBranch),
        receiptDate: toStringOrNull(raw.receiptDate),
        invoiceNumber: toStringOrNull(raw.invoiceNumber),
        totalAmount: toNumberOrNull(raw.totalAmount),
        currency: toStringOrNull(raw.currency) || 'VND',
        productLineCount: typeof raw.productLineCount === 'number' ? raw.productLineCount : 0,
        createdAt: importedAt ? importedAt.toDate().toISOString() : undefined,
      };
    });
  }

  async fetchStockReceiptDetail(receiptId: string): Promise<SavedStockReceiptDetail | null> {
    const headerSnap = await this.db.collection(RECEIPTS_COLLECTION).doc(receiptId).get();
    if (!headerSnap.exists) return null;
    const raw = headerSnap.data() as Record<string, unknown>;

    const linesSnap = await this.db
      .collection(RECEIPTS_COLLECTION)
      .doc(receiptId)
      .collection(LINES_SUBCOLLECTION)
      .orderBy('createdAt', 'asc')
      .get();
    const lineItems = linesSnap.docs
      .map((d) => normalizeLine(d.data()))
      .filter((x): x is BillLineItem => Boolean(x));

    const v = (raw.validation || {}) as Record<string, unknown>;
    const validation: StockReceiptValidationSnapshot = {
      isLikelyReceipt: Boolean(v.isLikelyReceipt),
      confidence: toNumberOrNull(v.confidence) ?? 0,
      reasonVi: toStringOrNull(v.reasonVi) || '',
      heuristicScore: toNumberOrNull(v.heuristicScore) ?? 0,
      heuristicNoteVi: toStringOrNull(v.heuristicNoteVi) || '',
    };

    const createdTs = raw.createdAt instanceof Ts ? (raw.createdAt as Timestamp) : null;

    return {
      id: headerSnap.id,
      supplierNameRaw: toStringOrNull(raw.supplierNameRaw),
      storeOrBranch: toStringOrNull(raw.storeOrBranch),
      receiptDate: toStringOrNull(raw.receiptDate),
      invoiceNumber: toStringOrNull(raw.invoiceNumber),
      totalAmount: toNumberOrNull(raw.totalAmount),
      currency: toStringOrNull(raw.currency) || 'VND',
      productLineCount:
        typeof raw.productLineCount === 'number' ? raw.productLineCount : lineItems.length,
      createdAt: createdTs ? createdTs.toDate().toISOString() : undefined,
      subtotal: toNumberOrNull(raw.subtotal),
      tax: toNumberOrNull(raw.tax),
      discount: toNumberOrNull(raw.discount),
      paymentMethod: toStringOrNull(raw.paymentMethod),
      notes: toStringOrNull(raw.notes),
      ocrText: typeof raw.ocrText === 'string' ? raw.ocrText : '',
      receiptImageBase64:
        typeof raw.receiptImageBase64 === 'string' ? raw.receiptImageBase64 : undefined,
      receiptImageMimeType:
        typeof raw.receiptImageMimeType === 'string' ? raw.receiptImageMimeType : undefined,
      lineItems,
      validation,
    };
  }

  // ── GHI đơn giản ─────────────────────────────────────────────────────────

  async updateSupplier(
    id: string,
    patch: Partial<SupplierContactInfo> & { name?: string },
  ): Promise<void> {
    const ref = this.db.collection(SUPPLIERS_COLLECTION).doc(id);
    const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };

    const setField = (key: keyof SupplierContactInfo, v?: string | null) => {
      if (v === undefined) return;
      if (typeof v === 'string') {
        const s = v.trim();
        payload[key] = s ? s : null;
      } else {
        payload[key] = v;
      }
    };
    setField('phone', patch.phone);
    setField('address', patch.address);
    setField('contactPerson', patch.contactPerson);
    setField('email', patch.email);
    setField('taxCode', patch.taxCode);
    setField('category', patch.category);
    setField('notes', patch.notes);

    if (patch.name !== undefined) {
      const nm = (patch.name || '').trim();
      if (nm) {
        payload.name = nm;
        payload.normalizedName = normalizeSupplierKey(nm);
      }
    }
    await ref.update(payload);
  }

  // ── GHI phức tạp (port từ FE, dùng batch + pre-read như bản gốc) ──────────

  private async computeBillHash(input: {
    ocrText: string;
    totalAmount: number | null;
    receiptDate: string | null;
    supplierKey: string;
  }): Promise<string> {
    const payload = [
      input.supplierKey,
      input.receiptDate ?? '',
      String(input.totalAmount ?? ''),
      (input.ocrText || '').trim().slice(0, 4000),
    ].join('||');
    return sha256Hex(payload);
  }

  private async findReceiptByHash(billHash: string): Promise<string | null> {
    const snap = await this.db
      .collection(RECEIPTS_COLLECTION)
      .where('billHash', '==', billHash)
      .limit(1)
      .get();
    return snap.empty ? null : snap.docs[0].id;
  }

  private async resolveSupplier(
    rawName: string | null,
    targetSupplierId: string | null,
  ): Promise<{ ref: DocRef; isNew: boolean; name: string; normalizedKey: string } | null> {
    if (targetSupplierId) {
      const ref = this.db.collection(SUPPLIERS_COLLECTION).doc(targetSupplierId);
      const snap = await ref.get();
      if (snap.exists) {
        const data = snap.data() as Record<string, unknown>;
        const existingName = typeof data.name === 'string' ? data.name : (rawName || '').trim();
        const normalizedKey =
          typeof data.normalizedName === 'string'
            ? data.normalizedName
            : normalizeSupplierKey(existingName);
        return { ref, isNew: false, name: existingName, normalizedKey };
      }
    }

    const name = (rawName || '').trim();
    if (!name) return null;
    const normalizedKey = normalizeSupplierKey(name);
    if (!normalizedKey) return null;

    const snap = await this.db
      .collection(SUPPLIERS_COLLECTION)
      .where('normalizedName', '==', normalizedKey)
      .limit(1)
      .get();
    if (!snap.empty) {
      return {
        ref: this.db.collection(SUPPLIERS_COLLECTION).doc(snap.docs[0].id),
        isNew: false,
        name,
        normalizedKey,
      };
    }
    return {
      ref: this.db.collection(SUPPLIERS_COLLECTION).doc(),
      isNew: true,
      name,
      normalizedKey,
    };
  }

  private async resolveMaterial(line: BillLineItem): Promise<{
    ref: DocRef;
    isNew: boolean;
    canonicalName: string;
    canonicalUnit: string | null;
    normalizedKey: string;
  } | null> {
    const name = (line.name || '').trim();
    if (!name) return null;
    const { fullKey } = normalizeItem(name);
    if (!fullKey) return null;
    const unitCanon = canonicalUnit(line.unit);

    const snap = await this.db
      .collection(MATERIALS_COLLECTION)
      .where('normalizedName', '==', fullKey)
      .limit(1)
      .get();
    if (!snap.empty) {
      return {
        ref: this.db.collection(MATERIALS_COLLECTION).doc(snap.docs[0].id),
        isNew: false,
        canonicalName: name,
        canonicalUnit: unitCanon,
        normalizedKey: fullKey,
      };
    }
    return {
      ref: this.db.collection(MATERIALS_COLLECTION).doc(),
      isNew: true,
      canonicalName: name,
      canonicalUnit: unitCanon,
      normalizedKey: fullKey,
    };
  }

  async saveStockReceiptDraft(
    input: SaveStockReceiptDraftInput & { createdByUid?: string | null },
  ): Promise<{ id: string }> {
    const {
      structured,
      validation,
      ocrText,
      receiptImageBase64,
      receiptImageMimeType,
      createdByUid,
      targetSupplierId,
      supplierContact,
    } = input;

    const supplier = await this.resolveSupplier(
      structured.supplierName ?? null,
      targetSupplierId ?? null,
    );
    const supplierKey = supplier?.normalizedKey ?? '';

    const billHash = await this.computeBillHash({
      ocrText,
      totalAmount: structured.totalAmount ?? null,
      receiptDate: structured.receiptDate ?? null,
      supplierKey,
    });
    const dupId = await this.findReceiptByHash(billHash);
    if (dupId) {
      throw new Error(`DUPLICATE_BILL:${dupId}`);
    }

    const rawLines = (structured.lineItems || [])
      .map(normalizeLine)
      .filter((x): x is BillLineItem => Boolean(x));

    const materialResolutions = await Promise.all(
      rawLines.map((l) => this.resolveMaterial(l)),
    );

    const writesEstimate =
      1 + (supplier ? 1 : 0) + materialResolutions.filter(Boolean).length * 2 + rawLines.length;
    if (writesEstimate > BATCH_LIMIT_SAFE) {
      throw new Error('TOO_MANY_LINES');
    }

    const batch = this.db.batch();
    const headerRef = this.db.collection(RECEIPTS_COLLECTION).doc();
    const total = typeof structured.totalAmount === 'number' ? structured.totalAmount : 0;
    const amountCheck = computeAmountCheck(structured);
    const contact = cleanContact(supplierContact);

    if (supplier) {
      if (supplier.isNew) {
        batch.set(supplier.ref, {
          name: supplier.name,
          normalizedName: supplier.normalizedKey,
          receiptCount: 1,
          totalAmount: total,
          lastReceiptDate: nowIso(),
          ...contact,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.update(supplier.ref, {
          receiptCount: increment(1),
          totalAmount: increment(total),
          lastReceiptDate: nowIso(),
          ...contact,
          updatedAt: serverTimestamp(),
        });
      }
    }

    batch.set(headerRef, {
      supplierId: supplier?.ref.id ?? null,
      supplierNameRaw: structured.supplierName ?? null,
      supplierNameCanonical: supplier?.name ?? null,
      storeOrBranch: structured.storeOrBranch ?? null,
      invoiceNumber: structured.invoiceNumber ?? null,
      supplierPhone: structured.supplierPhone ?? null,
      supplierAddress: structured.supplierAddress ?? null,
      receiptDate: structured.receiptDate ?? null,
      receiptTime: structured.receiptTime ?? null,
      subtotal: structured.subtotal ?? null,
      tax: structured.tax ?? null,
      discount: structured.discount ?? null,
      totalAmount: structured.totalAmount ?? null,
      currency: structured.currency || 'VND',
      paymentMethod: structured.paymentMethod ?? null,
      notes: structured.notes ?? null,
      productLineCount: Number.isFinite(structured.productLineCount)
        ? structured.productLineCount
        : rawLines.length,
      ocrText,
      receiptImageBase64: receiptImageBase64 ?? null,
      receiptImageMimeType: receiptImageMimeType ?? null,
      validation,
      amountCheck: {
        sumLines: amountCheck.sumLines,
        deltaPct: amountCheck.deltaPct,
        warn: amountCheck.warn,
      },
      billHash,
      status: 'committed',
      createdByUid: createdByUid ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    materialResolutions.forEach((mres, idx) => {
      const line = rawLines[idx];
      if (!line || !mres) return;
      const qty = typeof line.quantity === 'number' ? line.quantity : 0;
      const amount = typeof line.lineTotal === 'number' ? line.lineTotal : 0;
      const unitPrice =
        typeof line.unitPrice === 'number'
          ? line.unitPrice
          : qty > 0 && amount > 0
            ? amount / qty
            : null;

      if (mres.isNew) {
        batch.set(mres.ref, {
          name: mres.canonicalName,
          normalizedName: mres.normalizedKey,
          canonicalUnit: mres.canonicalUnit,
          importCount: 1,
          totalQty: qty,
          totalAmount: amount,
          lastUnitPrice: unitPrice,
          lastSupplierId: supplier?.ref.id ?? null,
          lastSupplierName: supplier?.name ?? null,
          lastReceiptDate: nowIso(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.update(mres.ref, {
          importCount: increment(1),
          totalQty: increment(qty),
          totalAmount: increment(amount),
          lastUnitPrice: unitPrice,
          lastSupplierId: supplier?.ref.id ?? null,
          lastSupplierName: supplier?.name ?? null,
          lastReceiptDate: nowIso(),
          updatedAt: serverTimestamp(),
        });
      }

      const lineRef = headerRef.collection(LINES_SUBCOLLECTION).doc();
      batch.set(lineRef, {
        ...line,
        unitPrice,
        materialId: mres.ref.id,
        materialNameRaw: mres.canonicalName,
        receiptId: headerRef.id,
        receiptDate: structured.receiptDate ?? null,
        supplierId: supplier?.ref.id ?? null,
        supplierNameRaw: supplier?.name ?? null,
        createdAt: serverTimestamp(),
      });
    });

    await batch.commit();
    return { id: headerRef.id };
  }

  async mergeSuppliers(rootId: string, duplicateIds: string[]): Promise<void> {
    const dupSet = new Set(duplicateIds.filter((id) => id && id !== rootId));
    if (dupSet.size === 0) return;
    const dups = Array.from(dupSet);

    const rootRef = this.db.collection(SUPPLIERS_COLLECTION).doc(rootId);
    const rootSnap = await rootRef.get();
    if (!rootSnap.exists) throw new Error('Root supplier không tồn tại');
    const rootData = rootSnap.data() as Record<string, unknown>;
    const rootName = typeof rootData.name === 'string' ? rootData.name : '';

    const dupSnaps = await Promise.all(
      dups.map((id) => this.db.collection(SUPPLIERS_COLLECTION).doc(id).get()),
    );
    let receiptCountSum = 0;
    let totalAmountSum = 0;
    const existing: string[] = [];
    dupSnaps.forEach((s, idx) => {
      if (!s.exists) return;
      const d = s.data() as Record<string, unknown>;
      receiptCountSum += typeof d.receiptCount === 'number' ? d.receiptCount : 0;
      totalAmountSum += typeof d.totalAmount === 'number' ? d.totalAmount : 0;
      existing.push(dups[idx]);
    });
    if (existing.length === 0) return;

    const receiptDocs: { ref: DocRef }[] = [];
    for (const grp of chunk(existing, 10)) {
      const snap = await this.db
        .collection(RECEIPTS_COLLECTION)
        .where('supplierId', 'in', grp)
        .get();
      snap.docs.forEach((d) => receiptDocs.push({ ref: d.ref }));
    }

    const materialDocs: { ref: DocRef }[] = [];
    for (const grp of chunk(existing, 10)) {
      const snap = await this.db
        .collection(MATERIALS_COLLECTION)
        .where('lastSupplierId', 'in', grp)
        .get();
      snap.docs.forEach((d) => materialDocs.push({ ref: d.ref }));
    }

    const allWrites = receiptDocs.length + materialDocs.length + existing.length + 1;
    const batches: admin.firestore.WriteBatch[] = [this.db.batch()];
    let count = 0;
    const enqueue = (fn: (b: admin.firestore.WriteBatch) => void) => {
      if (count >= 450) {
        batches.push(this.db.batch());
        count = 0;
      }
      fn(batches[batches.length - 1]);
      count++;
    };

    if (allWrites > 480) {
      receiptDocs.forEach((r) =>
        enqueue((b) =>
          b.update(r.ref, {
            supplierId: rootId,
            supplierNameCanonical: rootName,
            updatedAt: serverTimestamp(),
          }),
        ),
      );
      materialDocs.forEach((m) =>
        enqueue((b) =>
          b.update(m.ref, {
            lastSupplierId: rootId,
            lastSupplierName: rootName,
            updatedAt: serverTimestamp(),
          }),
        ),
      );
      enqueue((b) =>
        b.update(rootRef, {
          receiptCount: increment(receiptCountSum),
          totalAmount: increment(totalAmountSum),
          updatedAt: serverTimestamp(),
        }),
      );
      existing.forEach((id) =>
        enqueue((b) => b.delete(this.db.collection(SUPPLIERS_COLLECTION).doc(id))),
      );
      for (const b of batches) await b.commit();
      return;
    }

    const batch = this.db.batch();
    receiptDocs.forEach((r) =>
      batch.update(r.ref, {
        supplierId: rootId,
        supplierNameCanonical: rootName,
        updatedAt: serverTimestamp(),
      }),
    );
    materialDocs.forEach((m) =>
      batch.update(m.ref, {
        lastSupplierId: rootId,
        lastSupplierName: rootName,
        updatedAt: serverTimestamp(),
      }),
    );
    batch.update(rootRef, {
      receiptCount: increment(receiptCountSum),
      totalAmount: increment(totalAmountSum),
      updatedAt: serverTimestamp(),
    });
    existing.forEach((id) => batch.delete(this.db.collection(SUPPLIERS_COLLECTION).doc(id)));
    await batch.commit();
  }

  async mergeMaterials(rootId: string, duplicateIds: string[]): Promise<void> {
    const dupSet = new Set(duplicateIds.filter((id) => id && id !== rootId));
    if (dupSet.size === 0) return;
    const dups = Array.from(dupSet);

    const rootRef = this.db.collection(MATERIALS_COLLECTION).doc(rootId);
    const rootSnap = await rootRef.get();
    if (!rootSnap.exists) throw new Error('Root material không tồn tại');
    const rootData = rootSnap.data() as Record<string, unknown>;
    const rootName = typeof rootData.name === 'string' ? rootData.name : '';

    const dupSnaps = await Promise.all(
      dups.map((id) => this.db.collection(MATERIALS_COLLECTION).doc(id).get()),
    );
    let importCountSum = 0;
    let totalQtySum = 0;
    let totalAmountSum = 0;
    const existing: string[] = [];
    dupSnaps.forEach((s, idx) => {
      if (!s.exists) return;
      const d = s.data() as Record<string, unknown>;
      importCountSum += typeof d.importCount === 'number' ? d.importCount : 0;
      totalQtySum += typeof d.totalQty === 'number' ? d.totalQty : 0;
      totalAmountSum += typeof d.totalAmount === 'number' ? d.totalAmount : 0;
      existing.push(dups[idx]);
    });
    if (existing.length === 0) return;

    const lineDocs: { ref: DocRef }[] = [];
    for (const grp of chunk(existing, 10)) {
      const snap = await this.db
        .collectionGroup(LINES_SUBCOLLECTION)
        .where('materialId', 'in', grp)
        .get();
      snap.docs.forEach((d) => lineDocs.push({ ref: d.ref }));
    }

    const allWrites = lineDocs.length + existing.length + 1;
    if (allWrites > 480) {
      const batches: admin.firestore.WriteBatch[] = [this.db.batch()];
      let count = 0;
      const enqueue = (fn: (b: admin.firestore.WriteBatch) => void) => {
        if (count >= 450) {
          batches.push(this.db.batch());
          count = 0;
        }
        fn(batches[batches.length - 1]);
        count++;
      };
      lineDocs.forEach((l) =>
        enqueue((b) => b.update(l.ref, { materialId: rootId, materialNameRaw: rootName })),
      );
      enqueue((b) =>
        b.update(rootRef, {
          importCount: increment(importCountSum),
          totalQty: increment(totalQtySum),
          totalAmount: increment(totalAmountSum),
          updatedAt: serverTimestamp(),
        }),
      );
      existing.forEach((id) =>
        enqueue((b) => b.delete(this.db.collection(MATERIALS_COLLECTION).doc(id))),
      );
      for (const b of batches) await b.commit();
      return;
    }

    const batch = this.db.batch();
    lineDocs.forEach((l) =>
      batch.update(l.ref, { materialId: rootId, materialNameRaw: rootName }),
    );
    batch.update(rootRef, {
      importCount: increment(importCountSum),
      totalQty: increment(totalQtySum),
      totalAmount: increment(totalAmountSum),
      updatedAt: serverTimestamp(),
    });
    existing.forEach((id) => batch.delete(this.db.collection(MATERIALS_COLLECTION).doc(id)));
    await batch.commit();
  }
}
