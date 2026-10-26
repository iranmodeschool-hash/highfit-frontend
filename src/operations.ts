import { makeId, openData, type AppData } from './data';

export type Dispatch = { id: string; serial: string; dispatch_date: string; workshop_id: string; origin_center: string; status: 'draft' | 'issued' | 'partial_received' | 'fully_received' | 'cancelled'; note: string; created_by_role: string; created_at: string };
export type DispatchLine = { id: string; dispatch_id: string; product_id?: string; product_component_id: string; note: string };
export type Quantity = { id: string; dispatch_line_id: string; size_id: string; qty: number };
export type Receipt = { id: string; serial?: string; dispatch_id: string; received_date: string; status: 'approved' | 'pending_manager'; note: string; created_at: string; review_note?: string; reviewed_at?: string };
export type ReceiptLine = { id: string; receipt_id: string; dispatch_line_id: string; size_id: string; declared_qty: number; actual_qty: number; note: string };
export type Delivery = { id: string; serial?: string; dispatch_id: string; workshop_id: string; delivery_date: string; status: 'draft' | 'pending_approval' | 'needs_revision' | 'approved' | 'cancelled'; submitted_at: string | null; reviewed_at: string | null; reviewed_by_role: string | null; reject_reason: string; note: string };
export type DeliveryLine = { id: string; delivery_id: string; dispatch_line_id: string; size_id: string; qty_sewn: number; qty_delivered: number; qty_accepted: number | null; note: string };
export type Ledger = { id: string; workshop_id: string; source_type: 'sewing_delivery'; source_id: string; product_component_id: string; size_id: string; qty_base: number; rate_id: string; rate_amount_snapshot: number; gross_amount: number; adjustment_amount: number; net_amount: number; payment_status: 'unpaid' | 'partial' | 'paid'; created_at: string };
export type Payment = { id: string; serial?: string; workshop_id: string; payment_date: string; amount: number; method: 'cash' | 'card' | 'transfer' | 'other'; reference: string; note: string; created_by_role: string; created_at: string };
export type Allocation = { id: string; payment_id: string; wage_ledger_id: string; allocated_amount: number };
export type RateHistory = { id: string; workshop_id: string; product_component_id: string; amount_toman: number; effective_from: string; created_at: string };
export type CutDefect = { id: string; dispatch_id: string; dispatch_line_id: string; size_id: string; declared_qty: number; approved_qty: number | null; defect_type: 'fabric' | 'cut' | 'shortage' | 'damage' | 'other'; responsibility: 'factory' | 'workshop' | 'supplier' | 'unknown'; note: string; status: 'declared' | 'pending_manager' | 'approved' | 'rejected' | 'replacement' | 'recut' | 'scrapped'; review_note: string; created_at: string; reviewed_at: string | null };
export type RepairCounts = { repaired: number; unrepairable: number; needs_review: number };
export type RepairEvent = { id: string; at: string; role: 'workshop' | 'manager'; action: 'result_submitted' | 'returned_for_revision' | 'approved'; counts?: RepairCounts; note: string; wage_effect?: RepairReturn['wage_effect']; amount?: number };
export type RepairReturn = { id: string; delivery_line_id: string; workshop_id: string; qty: number; reason: string; responsibility: 'factory' | 'workshop' | 'supplier' | 'unknown'; status: 'submitted' | 'ready_review' | 'closed'; result: 'repaired' | 'unrepairable' | 'needs_review' | null; result_note: string; result_counts?: RepairCounts; history?: RepairEvent[]; revision_reason?: string; wage_effect: 'none' | 'separate_wage' | 'deduction' | null; amount: number; created_at: string; reviewed_at: string | null };
export type RepairAdjustment = { id: string; target_type: 'wage_ledger'; target_id: string; repair_return_id?: string; amount: number; reason: string; status: 'pending' | 'approved'; created_at: string; approved_at?: string }; 
export type SyncEntry = { id: string; doc_type: string; doc_id: string; status: 'pending' | 'synced'; created_at: string; synced_at: string | null };
export type Snapshot = { repairs: RepairReturn[]; adjustments: RepairAdjustment[]; defects: CutDefect[]; dispatches: Dispatch[]; lines: DispatchLine[]; quantities: Quantity[]; receipts: Receipt[]; receiptLines: ReceiptLine[]; deliveries: Delivery[]; deliveryLines: DeliveryLine[]; ledger: Ledger[]; payments: Payment[]; allocations: Allocation[]; rates: RateHistory[] };
const map = { repairs: 'repair_returns', adjustments: 'adjustments', defects: 'cut_defects', dispatches: 'dispatches', lines: 'dispatch_lines', quantities: 'dispatch_size_qty', receipts: 'workshop_receipts', receiptLines: 'workshop_receipt_lines', deliveries: 'sewing_deliveries', deliveryLines: 'sewing_delivery_lines', ledger: 'wage_ledger', payments: 'payments', allocations: 'payment_allocations', rates: 'workshop_rates' } as const;
const stores = [...Object.values(map), 'audit_log', 'sync_queue'] as string[];
const req = <T,>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
const finished = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error('عملیات ذخیره نشد.')); });
const now = () => new Date().toISOString();
export function suggestSerial(prefix: 'D' | 'R' | 'SD' | 'P', isoDate: string, rows: { serial?: string }[]): string {
  const year = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', timeZone: 'UTC' }).format(new Date(`${isoDate}T12:00:00Z`));
  const head = `${prefix}-${year}-`;
  const last = rows.reduce((max, row) => {
    const suffix = row.serial?.startsWith(head) ? row.serial.slice(head.length) : '';
    return /^\d+$/.test(suffix) ? Math.max(max, Number(suffix)) : max;
  }, 0);
  return `${head}${String(last + 1).padStart(4, '0')}`;
}
const assert: (ok: unknown, message: string) => asserts ok = (ok, message) => { if (!ok) throw new Error(message); };
const qty = (n: number) => Number.isSafeInteger(n) && n >= 0;
const audit = (tx: IDBTransaction, entity: string, entityId: string, action: string, role: string) => {
  const at = now();
  tx.objectStore('audit_log').put({ id: makeId(), entity, entity_id: entityId, action, before_json: null, after_json: null, by_role: role, at });
  tx.objectStore('sync_queue').put({ id: makeId(), doc_type: entity, doc_id: entityId, status: 'pending', created_at: at, synced_at: null } satisfies SyncEntry);
};
export async function loadSyncQueue(): Promise<SyncEntry[]> {
  const db = await openData();
  try {
    const tx = db.transaction('sync_queue', 'readonly'); const end = finished(tx);
    const rows = await req(tx.objectStore('sync_queue').getAll()) as SyncEntry[];
    await end;
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  } finally { db.close(); }
}
export async function simulateSync(ids: string[]): Promise<number> {
  const db = await openData();
  try {
    const tx = db.transaction('sync_queue', 'readwrite'); const end = finished(tx);
    let count = 0;
    for (const id of ids) {
      const row = await req(tx.objectStore('sync_queue').get(id)) as SyncEntry | undefined;
      if (row?.status === 'pending') {
        tx.objectStore('sync_queue').put({ ...row, status: 'synced', synced_at: now() } satisfies SyncEntry);
        count++;
      }
    }
    await end;
    return count;
  } finally { db.close(); }
}
async function read(tx: IDBTransaction): Promise<Snapshot> {
  const keys = Object.keys(map) as (keyof Snapshot)[];
  const rows = await Promise.all(keys.map(key => req(tx.objectStore(map[key]).getAll())));
  return Object.fromEntries(keys.map((key, i) => [key, rows[i]])) as Snapshot;
}
export async function loadOperations(): Promise<Snapshot> {
  const db = await openData();
  try { const tx = db.transaction(Object.values(map), 'readonly'); const end = finished(tx); const result = await read(tx); await end; return result; }
  finally { db.close(); }
}
async function mutate(action: (tx: IDBTransaction, s: Snapshot) => void | Promise<void>) {
  const db = await openData();
  try { const tx = db.transaction(stores, 'readwrite'); const end = finished(tx); try { const snapshot = await read(tx); await action(tx, snapshot); await end; } catch (e) { try { tx.abort(); } catch { /* already ended */ } await end.catch(() => {}); throw e; } }
  finally { db.close(); }
}
export const sentFor = (s: Snapshot, lineId: string, sizeId: string) => s.quantities.find(q => q.dispatch_line_id === lineId && q.size_id === sizeId)?.qty ?? 0;
export const receivedFor = (s: Snapshot, lineId: string, sizeId: string) => s.receiptLines.filter(x => x.dispatch_line_id === lineId && x.size_id === sizeId && s.receipts.some(r => r.id === x.receipt_id && r.status === 'approved')).reduce((n, x) => n + x.actual_qty, 0);
export const approvedDefectsFor = (s: Snapshot, lineId: string, sizeId: string) => s.defects.filter(x => x.dispatch_line_id === lineId && x.size_id === sizeId && x.status === 'approved').reduce((n, x) => n + (x.approved_qty ?? 0), 0);
export const sewableFor = (s: Snapshot, lineId: string, sizeId: string) => Math.max(0, receivedFor(s, lineId, sizeId) - approvedDefectsFor(s, lineId, sizeId));
export const acceptedFor = (s: Snapshot, lineId: string, sizeId: string) => s.deliveryLines.filter(x => x.dispatch_line_id === lineId && x.size_id === sizeId && s.deliveries.some(d => d.id === x.delivery_id && d.status === 'approved')).reduce((n, x) => n + (x.qty_accepted ?? 0), 0);
export const sewnFor = (s: Snapshot, lineId: string, sizeId: string) => s.deliveryLines.filter(x => x.dispatch_line_id === lineId && x.size_id === sizeId && s.deliveries.some(d => d.id === x.delivery_id && d.status === 'approved')).reduce((n, x) => n + (x.qty_sewn ?? x.qty_delivered), 0);
export const pendingFor = (s: Snapshot, lineId: string, sizeId: string, excludeId?: string) => s.deliveryLines.filter(x => x.dispatch_line_id === lineId && x.size_id === sizeId && x.delivery_id !== excludeId && s.deliveries.some(d => d.id === x.delivery_id && d.status === 'pending_approval')).reduce((n, x) => n + (x.qty_sewn ?? x.qty_delivered), 0);
export const receiptHasDiscrepancy = (s: Snapshot, receiptId: string) => s.receiptLines.some(l => l.receipt_id === receiptId && l.actual_qty !== l.declared_qty);
export const paidFor = (s: Snapshot, ledgerId: string) => s.allocations.filter(a => a.wage_ledger_id === ledgerId).reduce((n, a) => n + a.allocated_amount, 0);
export type DraftLine = { id: string; product_id?: string; product_component_id: string; quantities: Record<string, number> };
export async function saveDispatch(role: string, workshopId: string, input: { id?: string; serial: string; dispatch_date: string; workshop_id: string; origin_center: string; note: string; lines: DraftLine[] }, issue: boolean, data: AppData) {
  assert(role === 'manager', 'فقط مدیر حواله ثبت می‌کند.');
  assert(data.workshops.some(w => w.id === input.workshop_id && w.active), 'کارگاه فعال انتخاب کنید.');
  assert(input.serial.trim() && input.dispatch_date && input.origin_center.trim(), 'شماره، تاریخ و مرکز ارسال الزامی‌اند.');
  assert(input.lines.length > 0, 'حداقل یک ردیف لازم است.');
  assert(input.lines.every(l => data.products.some(p => (!l.product_id || p.id === l.product_id) && p.parts.some(part => part.id === l.product_component_id && part.active)) && Object.values(l.quantities).every(qty) && Object.values(l.quantities).some(n => n > 0)), 'هر ردیف باید جزء مرتبط با محصول و دست‌کم یک تعداد مثبت داشته باشد.');
  const ids = input.lines.map(l => `${l.product_id ?? ''}:${l.product_component_id}`); assert(new Set(ids).size === ids.length, 'برای هر رابطهٔ محصول و جزء تنها یک ردیف ثبت کنید.');
  assert(input.lines.every(l => Object.keys(l.quantities).every(id => data.sizes.some(z => z.id === id && z.active))), 'سایز نامعتبر است.');
  await mutate((tx, s) => {
    assert(!s.dispatches.some(d => d.serial === input.serial.trim() && d.id !== input.id), 'شماره حواله تکراری است.');
    const old = s.dispatches.find(d => d.id === input.id);
    assert(!input.id || old?.status === 'draft', 'فقط پیش‌نویس قابل ویرایش است.');
    const id = input.id ?? makeId();
    if (old) for (const line of s.lines.filter(x => x.dispatch_id === id)) { for (const q of s.quantities.filter(q => q.dispatch_line_id === line.id)) tx.objectStore('dispatch_size_qty').delete(q.id); tx.objectStore('dispatch_lines').delete(line.id); }
    tx.objectStore('dispatches').put({ id, serial: input.serial.trim(), dispatch_date: input.dispatch_date, workshop_id: input.workshop_id, origin_center: input.origin_center.trim(), status: issue ? 'issued' : 'draft', note: input.note, created_by_role: 'manager', created_at: old?.created_at ?? now() } satisfies Dispatch);
    for (const line of input.lines) { const lineId = makeId(); tx.objectStore('dispatch_lines').put({ id: lineId, dispatch_id: id, product_id: line.product_id ?? data.products.find(p => p.parts.some(x => x.id === line.product_component_id))?.id, product_component_id: line.product_component_id, note: '' } satisfies DispatchLine); for (const [sizeId, count] of Object.entries(line.quantities)) if (count > 0) tx.objectStore('dispatch_size_qty').put({ id: makeId(), dispatch_line_id: lineId, size_id: sizeId, qty: count } satisfies Quantity); }
    audit(tx, 'dispatch', id, issue ? 'issued' : 'draft_saved', role);
  });
}
export async function cancelDispatch(role: string, id: string) {
  assert(role === 'manager', 'فقط مدیر می‌تواند لغو کند.');
  await mutate((tx, s) => { const d = s.dispatches.find(x => x.id === id); assert(d && ['draft','issued'].includes(d.status) && !s.receipts.some(r => r.dispatch_id === id), 'این حواله قابل لغو نیست.'); tx.objectStore('dispatches').put({ ...d, status: 'cancelled' }); audit(tx, 'dispatch', id, 'cancelled', role); });
}
export async function saveReceipt(role: string, ws: string, dispatchId: string, day: string, values: Record<string, number>, note: string) {
  assert(role === 'workshop', 'ثبت دریافت فقط برای کارگاه است.');
  await mutate((tx, s) => {
    const d = s.dispatches.find(x => x.id === dispatchId); assert(d && d.workshop_id === ws && ['issued','partial_received'].includes(d.status), 'حوالهٔ قابل دریافت یافت نشد.'); assert(day, 'تاریخ الزامی است.');
    assert(!s.receipts.some(r => r.dispatch_id === dispatchId && r.status === 'pending_manager'), 'ابتدا مغایرت رسید قبلی باید بررسی شود.');
    const all = s.quantities.filter(q => s.lines.some(l => l.id === q.dispatch_line_id && l.dispatch_id === d.id) && receivedFor(s, q.dispatch_line_id, q.size_id) < q.qty);
    assert(all.length && Object.keys(values).length, 'دست‌کم یک ردیف دریافت وارد کنید.');
    assert(Object.entries(values).every(([key, count]) => qty(count) && all.some(q => key === `${q.dispatch_line_id}|${q.size_id}`)), 'ردیف یا تعداد نامعتبر است.');
    const entries = all.filter(q => Object.hasOwn(values, `${q.dispatch_line_id}|${q.size_id}`));
    const receiptId = makeId(); let discrepancy = false;
    for (const q of entries) {
      const declared = q.qty - receivedFor(s, q.dispatch_line_id, q.size_id);
      const count = values[`${q.dispatch_line_id}|${q.size_id}`];
      if (count !== declared) discrepancy = true;
      tx.objectStore('workshop_receipt_lines').put({ id: makeId(), receipt_id: receiptId, dispatch_line_id: q.dispatch_line_id, size_id: q.size_id, declared_qty: declared, actual_qty: count, note: '' } satisfies ReceiptLine);
    }
    tx.objectStore('workshop_receipts').put({ id: receiptId, serial: suggestSerial('R', day, s.receipts), dispatch_id: d.id, received_date: day, status: discrepancy ? 'pending_manager' : 'approved', note, created_at: now() } satisfies Receipt);
    if (!discrepancy) {
      const complete = s.quantities.filter(q => s.lines.some(l => l.id === q.dispatch_line_id && l.dispatch_id === d.id)).every(q => receivedFor(s, q.dispatch_line_id, q.size_id) + (values[`${q.dispatch_line_id}|${q.size_id}`] ?? 0) >= q.qty);
      tx.objectStore('dispatches').put({ ...d, status: complete ? 'fully_received' : 'partial_received' });
    }
    audit(tx, 'workshop_receipt', receiptId, discrepancy ? 'pending_manager' : 'approved', role);
  });
}
export async function approveReceipt(role: string, receiptId: string, reviewNote: string) {
  assert(role === 'manager', 'فقط مدیر می‌تواند مغایرت را تأیید کند.');
  assert(reviewNote.trim(), 'توضیح تأیید مغایرت الزامی است.');
  await mutate((tx, s) => {
    const receipt = s.receipts.find(r => r.id === receiptId);
    assert(receipt?.status === 'pending_manager', 'این رسید در انتظار بررسی نیست.');
    const dispatch = s.dispatches.find(d => d.id === receipt.dispatch_id);
    assert(dispatch && dispatch.status !== 'cancelled', 'حواله یافت نشد.');
    const lines = s.receiptLines.filter(l => l.receipt_id === receiptId);
    assert(lines.length > 0, 'ردیف رسید یافت نشد.');
    tx.objectStore('workshop_receipts').put({ ...receipt, status: 'approved', review_note: reviewNote.trim(), reviewed_at: now() } satisfies Receipt);
    const complete = s.quantities.filter(q => s.lines.some(l => l.id === q.dispatch_line_id && l.dispatch_id === dispatch.id)).every(q => receivedFor(s, q.dispatch_line_id, q.size_id) + lines.filter(l => l.dispatch_line_id === q.dispatch_line_id && l.size_id === q.size_id).reduce((n, l) => n + l.actual_qty, 0) >= q.qty);
    tx.objectStore('dispatches').put({ ...dispatch, status: complete ? 'fully_received' : 'partial_received' });
    audit(tx, 'workshop_receipt', receiptId, 'discrepancy_approved', role);
  });
}
export async function declareCutDefect(role: string, ws: string, input: Pick<CutDefect, 'dispatch_id' | 'dispatch_line_id' | 'size_id' | 'declared_qty' | 'defect_type' | 'responsibility' | 'note'>) {
  assert(role === 'workshop', 'اعلام خرابی فقط برای کارگاه است.');
  await mutate((tx, s) => {
    const d = s.dispatches.find(x => x.id === input.dispatch_id);
    assert(d && d.workshop_id === ws && ['partial_received', 'fully_received'].includes(d.status), 'حوالهٔ دریافتی این کارگاه یافت نشد.');
    assert(s.lines.some(l => l.id === input.dispatch_line_id && l.dispatch_id === d.id) && sentFor(s, input.dispatch_line_id, input.size_id) > 0, 'ردیف یا سایز حواله نامعتبر است.');
    assert(Number.isSafeInteger(input.declared_qty) && input.declared_qty > 0 && input.declared_qty <= sewableFor(s, input.dispatch_line_id, input.size_id) - sewnFor(s, input.dispatch_line_id, input.size_id) - pendingFor(s, input.dispatch_line_id, input.size_id), 'تعداد خرابی از ماندهٔ قابل دوخت بیشتر است.');
    assert(['fabric','cut','shortage','damage','other'].includes(input.defect_type) && ['factory','workshop','supplier','unknown'].includes(input.responsibility), 'نوع خرابی یا مسئولیت نامعتبر است.');
    assert(input.note.trim().length <= 500, 'توضیحات نباید بیش از ۵۰۰ نویسه باشد.');
    const id = makeId();
    tx.objectStore('cut_defects').put({ ...input, id, note: input.note.trim(), approved_qty: null, status: 'declared', review_note: '', created_at: now(), reviewed_at: null } satisfies CutDefect);
    audit(tx, 'cut_defect', id, 'declared', role);
  });
}
export async function reviewCutDefect(role: string, id: string, decision: 'approved' | 'rejected' | 'pending_manager' | 'replacement' | 'recut' | 'scrapped', count: number, reviewNote: string) {
  assert(role === 'manager', 'فقط مدیر می‌تواند خرابی را بررسی کند.');
  await mutate((tx, s) => {
    const defect = s.defects.find(x => x.id === id);
    assert(defect && ['declared', 'pending_manager'].includes(defect.status), 'خرابی در انتظار بررسی نیست.');
    assert(Number.isSafeInteger(count) && count >= 0 && count <= defect.declared_qty, 'تعداد تأییدی نامعتبر است.');
    assert(decision !== 'approved' || count > 0, 'برای تأیید، تعداد مثبت وارد کنید.');
    assert(reviewNote.trim().length <= 500, 'توضیحات نباید بیش از ۵۰۰ نویسه باشد.');
    if (decision === 'approved') {
      assert(count + approvedDefectsFor(s, defect.dispatch_line_id, defect.size_id) + sewnFor(s, defect.dispatch_line_id, defect.size_id) + pendingFor(s, defect.dispatch_line_id, defect.size_id) <= receivedFor(s, defect.dispatch_line_id, defect.size_id), 'تعداد تأییدی از ماندهٔ دریافتیِ آزاد بیشتر است؛ ابتدا اسناد دوخت در انتظار را بررسی کنید.');
    }
    tx.objectStore('cut_defects').put({ ...defect, status: decision, approved_qty: decision === 'approved' ? count : null, review_note: reviewNote.trim(), reviewed_at: decision === 'pending_manager' ? null : now() } satisfies CutDefect);
    audit(tx, 'cut_defect', id, decision, role);
  });
}
export async function saveDelivery(role: string, ws: string, dispatchId: string, day: string, values: Record<string, number>, note: string, submit: boolean, existingId?: string, deliveredValues?: Record<string, number>) {
  assert(role === 'workshop', 'ثبت دوخت فقط برای کارگاه است.');
  await mutate((tx, s) => {
    const d = s.dispatches.find(x => x.id === dispatchId); assert(d && d.workshop_id === ws && ['partial_received','fully_received'].includes(d.status), 'حوالهٔ دریافتی یافت نشد.'); assert(day, 'تاریخ الزامی است.');
    const old = s.deliveries.find(x => x.id === existingId); assert(!existingId || (old?.workshop_id === ws && ['draft','needs_revision'].includes(old.status)), 'سند قابل ویرایش نیست.');
    assert(Object.values(values).every(qty), 'تعداد دوخته‌شده باید عدد صحیح نامنفی باشد.');
    const entries = Object.entries(values).filter(([, n]) => n > 0); assert(entries.length, 'دست‌کم یک تعداد دوخته‌شده وارد کنید.');
    assert(!submit || entries.some(([key]) => (deliveredValues?.[key] ?? values[key]) > 0), 'برای ارسال به مدیر، دست‌کم یک تعداد تحویل‌شده وارد کنید.');
    assert(!deliveredValues || Object.entries(deliveredValues).every(([key, count]) => qty(count) && count <= (values[key] ?? 0)), 'تعداد تحویل‌شده نباید از تعداد دوخته‌شده بیشتر باشد.');
    const id = existingId ?? makeId();
    if (old) for (const line of s.deliveryLines.filter(x => x.delivery_id === id)) tx.objectStore('sewing_delivery_lines').delete(line.id);
    for (const [key, count] of entries) {
      const [lineId, sizeId] = key.split('|'); assert(qty(count) && sentFor(s, lineId, sizeId) > 0 && s.lines.some(l => l.id === lineId && l.dispatch_id === d.id), 'ردیف دوخت نامعتبر است.');
      assert(count + sewnFor(s, lineId, sizeId) + pendingFor(s, lineId, sizeId, id) <= sewableFor(s, lineId, sizeId), 'مجموع دوخت ثبت‌شده بیشتر از تعداد قابل دوخت پس از خرابی تأییدشده است.');
      tx.objectStore('sewing_delivery_lines').put({ id: makeId(), delivery_id: id, dispatch_line_id: lineId, size_id: sizeId, qty_sewn: count, qty_delivered: deliveredValues?.[key] ?? count, qty_accepted: null, note: '' } satisfies DeliveryLine);
    }
    tx.objectStore('sewing_deliveries').put({ id, serial: old?.serial ?? suggestSerial('SD', day, s.deliveries), dispatch_id: d.id, workshop_id: ws, delivery_date: day, status: submit ? 'pending_approval' : 'draft', submitted_at: submit ? now() : null, reviewed_at: null, reviewed_by_role: null, reject_reason: '', note } satisfies Delivery);
    audit(tx, 'sewing_delivery', id, submit ? 'submitted' : 'draft_saved', role);
  });
}
export async function reviewDelivery(role: string, id: string, accepted: Record<string, number>, decision: 'approved' | 'needs_revision', reason: string, data: AppData) {
  assert(role === 'manager', 'فقط مدیر می‌تواند تحویل را بررسی کند.');
  await mutate((tx, s) => {
    const d = s.deliveries.find(x => x.id === id); assert(d?.status === 'pending_approval', 'سند در انتظار تأیید نیست.');
    const lines = s.deliveryLines.filter(x => x.delivery_id === id);
    if (decision === 'needs_revision') { assert(reason.trim(), 'دلیل اصلاح الزامی است.'); tx.objectStore('sewing_deliveries').put({ ...d, status: decision, reject_reason: reason.trim(), reviewed_at: now(), reviewed_by_role: role }); audit(tx, 'sewing_delivery', id, decision, role); return; }
    for (const line of lines) {
      const count = accepted[line.id] ?? line.qty_delivered;
      assert(qty(count) && count <= line.qty_delivered && count + acceptedFor(s, line.dispatch_line_id, line.size_id) <= sewableFor(s, line.dispatch_line_id, line.size_id), 'تعداد پذیرفته‌شده بیش از مقدار قابل دوخت پس از خرابی تأییدشده است.');
      if (count) {
        const componentId = s.lines.find(x => x.id === line.dispatch_line_id)?.product_component_id;
        assert(componentId, 'جزء حواله یافت نشد.');
        const current = data.rates.find(r => r.workshopId === d.workshop_id && r.partId === componentId);
        assert(current, 'برای همهٔ اجزای پذیرفته‌شده ابتدا نرخ دستمزد تعریف کنید.');
        assert(Number.isSafeInteger(current.amountToman) && Number.isSafeInteger(count * current.amountToman), 'مبلغ دستمزد معتبر نیست.');
        const history = s.rates.filter(r => r.workshop_id === d.workshop_id && r.product_component_id === componentId).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
        const gross = count * current.amountToman;
        tx.objectStore('wage_ledger').put({ id: makeId(), workshop_id: d.workshop_id, source_type: 'sewing_delivery', source_id: line.id, product_component_id: componentId, size_id: line.size_id, qty_base: count, rate_id: history?.id ?? current.id, rate_amount_snapshot: current.amountToman, gross_amount: gross, adjustment_amount: 0, net_amount: gross, payment_status: 'unpaid', created_at: now() } satisfies Ledger);
      }
      tx.objectStore('sewing_delivery_lines').put({ ...line, qty_accepted: count });
    }
    tx.objectStore('sewing_deliveries').put({ ...d, status: 'approved', reviewed_at: now(), reviewed_by_role: role, reject_reason: '' }); audit(tx, 'sewing_delivery', id, 'approved', role);
  });
}
export async function submitRepair(role: string, lineId: string, count: number, reason: string, responsibility: RepairReturn['responsibility']) {
  assert(role === 'manager', 'فقط مدیر مرجوعی ثبت می‌کند.');
  await mutate((tx, s) => {
    const line = s.deliveryLines.find(l => l.id === lineId);
    const delivery = s.deliveries.find(d => d.id === line?.delivery_id);
    assert(line && delivery?.status === 'approved' && (line.qty_accepted ?? 0) > 0, 'ردیف تحویل تأییدشده یافت نشد.');
    const returned = s.repairs.filter(r => r.delivery_line_id === lineId).reduce((sum, r) => sum + r.qty, 0);
    assert(Number.isSafeInteger(count) && count > 0 && count + returned <= (line.qty_accepted ?? 0), 'تعداد مرجوعی از تعداد پذیرفته‌شدهٔ باقی‌مانده بیشتر است.');
    assert(reason.trim().length > 0 && reason.trim().length <= 500, 'دلیل مرجوعی را وارد کنید (حداکثر ۵۰۰ نویسه).');
    assert(['factory', 'workshop', 'supplier', 'unknown'].includes(responsibility), 'مسئولیت معتبر نیست.');
    const id = makeId();
    tx.objectStore('repair_returns').put({ id, delivery_line_id: lineId, workshop_id: delivery.workshop_id, qty: count, reason: reason.trim(), responsibility, status: 'submitted', result: null, result_note: '', wage_effect: null, amount: 0, created_at: now(), reviewed_at: null } satisfies RepairReturn);
    audit(tx, 'repair_return', id, 'submitted', role);
  });
}
export async function recordRepairResult(role: string, ws: string, id: string, counts: RepairCounts, note: string) {
  assert(role === 'workshop', 'نتیجهٔ تعمیر را کارگاه ثبت می‌کند.');
  await mutate((tx, s) => {
    const repair = s.repairs.find(r => r.id === id);
    assert(repair?.workshop_id === ws && repair.status === 'submitted', 'مرجوعی در انتظار تعمیر برای این کارگاه یافت نشد.');
    assert(Object.values(counts).every(qty) && Object.values(counts).reduce((n, v) => n + v, 0) > 0 && Object.values(counts).reduce((n, v) => n + v, 0) <= repair.qty, 'مجموع نتیجه‌ها باید مثبت و حداکثر برابر تعداد مرجوعی باشد.');
    assert(note.trim().length <= 500, 'توضیح بیش از ۵۰۰ نویسه است.');
    const event: RepairEvent = { id: makeId(), at: now(), role: 'workshop', action: 'result_submitted', counts: { ...counts }, note: note.trim() };
    tx.objectStore('repair_returns').put({ ...repair, status: 'ready_review', result: null, result_counts: { ...counts }, result_note: note.trim(), revision_reason: '', history: [...(repair.history ?? []), event] } satisfies RepairReturn);
    audit(tx, 'repair_return', id, 'ready_review', role);
  });
}
export async function returnRepairForRevision(role: string, id: string, reason: string) {
  assert(role === 'manager', 'فقط مدیر نتیجه را برای اصلاح برمی‌گرداند.');
  assert(reason.trim() && reason.trim().length <= 500, 'دلیل اصلاح را وارد کنید (حداکثر ۵۰۰ نویسه).');
  await mutate((tx, s) => {
    const repair = s.repairs.find(r => r.id === id);
    assert(repair?.status === 'ready_review', 'نتیجه در انتظار بررسی نیست.');
    const event: RepairEvent = { id: makeId(), at: now(), role: 'manager', action: 'returned_for_revision', counts: repair.result_counts ? { ...repair.result_counts } : undefined, note: reason.trim() };
    tx.objectStore('repair_returns').put({ ...repair, status: 'submitted', revision_reason: reason.trim(), history: [...(repair.history ?? []), event] } satisfies RepairReturn);
    audit(tx, 'repair_return', id, 'returned_for_revision', role);
  });
}
export async function closeRepair(role: string, id: string, effect: NonNullable<RepairReturn['wage_effect']>, amount: number) {
  assert(role === 'manager', 'فقط مدیر تصمیم مالی می‌گیرد.');
  await mutate((tx, s) => {
    const repair = s.repairs.find(r => r.id === id);
    assert(repair?.status === 'ready_review', 'مرجوعی در انتظار تصمیم مدیر نیست.');
    assert(!s.adjustments.some(a => a.repair_return_id === id), 'اثر مالی این مرجوعی قبلاً ثبت شده است.');
    assert(['none', 'separate_wage', 'deduction'].includes(effect), 'تصمیم مالی معتبر نیست.');
    assert(Number.isSafeInteger(amount) && (effect === 'none' ? amount === 0 : amount > 0), 'مبلغ تصمیم مالی معتبر نیست.');
    const ledger = s.ledger.find(l => l.source_id === repair.delivery_line_id);
    assert(ledger, 'ردیف دستمزد مرجوعی یافت نشد.');
    const delta = effect === 'deduction' ? -amount : effect === 'separate_wage' ? amount : 0;
    const nextNet = ledger.net_amount + delta;
    assert(Number.isSafeInteger(nextNet) && nextNet >= paidFor(s, ledger.id), 'کسر نمی‌تواند مانده را از پرداخت‌های ثبت‌شده کمتر کند.');
    if (delta) {
      tx.objectStore('adjustments').put({ id: makeId(), target_type: 'wage_ledger', target_id: ledger.id, repair_return_id: id, amount: delta, reason: `مرجوعی تعمیراتی: ${repair.reason}`, status: 'approved', created_at: now() } satisfies RepairAdjustment);
      tx.objectStore('wage_ledger').put({ ...ledger, adjustment_amount: ledger.adjustment_amount + delta, net_amount: nextNet, payment_status: nextNet === paidFor(s, ledger.id) ? 'paid' : paidFor(s, ledger.id) > 0 ? 'partial' : 'unpaid' } satisfies Ledger);
    }
    const event: RepairEvent = { id: makeId(), at: now(), role: 'manager', action: 'approved', counts: repair.result_counts ? { ...repair.result_counts } : undefined, note: '', wage_effect: effect, amount };
    tx.objectStore('repair_returns').put({ ...repair, status: 'closed', wage_effect: effect, amount, reviewed_at: event.at, history: [...(repair.history ?? []), event] } satisfies RepairReturn);
    audit(tx, 'repair_return', id, 'closed', role);
  });
}
export async function requestWageAdjustment(role: string, ledgerId: string, amount: number, reason: string) {
  assert(role === 'manager', 'فقط مدیر می‌تواند تعدیل ثبت کند.');
  assert(Number.isSafeInteger(amount) && amount !== 0, 'مقدار تعدیل باید عدد صحیح غیرصفر باشد.');
  assert(reason.trim().length > 0 && reason.trim().length <= 500, 'دلیل تعدیل را وارد کنید (حداکثر ۵۰۰ نویسه).');
  await mutate((tx, s) => {
    assert(s.ledger.some(l => l.id === ledgerId), 'ردیف دستمزد یافت نشد.');
    const id = makeId();
    tx.objectStore('adjustments').put({ id, target_type: 'wage_ledger', target_id: ledgerId, amount, reason: reason.trim(), status: 'pending', created_at: now() } satisfies RepairAdjustment);
    audit(tx, 'adjustment', id, 'pending', role);
  });
}
export async function approveWageAdjustment(role: string, id: string) {
  assert(role === 'manager', 'فقط مدیر می‌تواند تعدیل را تأیید کند.');
  await mutate((tx, s) => {
    const adjustment = s.adjustments.find(a => a.id === id);
    assert(adjustment?.status === 'pending' && adjustment.target_type === 'wage_ledger', 'تعدیل در انتظار تأیید یافت نشد.');
    const ledger = s.ledger.find(l => l.id === adjustment.target_id);
    assert(ledger, 'ردیف دستمزد یافت نشد.');
    const nextNet = ledger.net_amount + adjustment.amount;
    const nextAdjustment = ledger.adjustment_amount + adjustment.amount;
    const paid = paidFor(s, ledger.id);
    assert(Number.isSafeInteger(nextNet) && Number.isSafeInteger(nextAdjustment) && nextNet >= paid, 'مبلغ نهایی نمی‌تواند از پرداخت‌های ثبت‌شده کمتر شود یا از محدودهٔ مجاز خارج شود.');
    tx.objectStore('wage_ledger').put({ ...ledger, adjustment_amount: nextAdjustment, net_amount: nextNet, payment_status: nextNet === paid ? 'paid' : paid > 0 ? 'partial' : 'unpaid' } satisfies Ledger);
    tx.objectStore('adjustments').put({ ...adjustment, status: 'approved', approved_at: now() } satisfies RepairAdjustment);
    audit(tx, 'adjustment', id, 'approved', role);
  });
}
export async function savePayment(role: string, ws: string, day: string, amount: number, method: Payment['method'], reference: string, note: string, manual?: Record<string, number>) {
  assert(role === 'manager', 'پرداخت فقط توسط مدیر ثبت می‌شود.'); assert(day && Number.isSafeInteger(amount) && amount > 0, 'تاریخ و مبلغ مثبت صحیح الزامی است.');
  await mutate((tx, s) => {
    const rows = s.ledger.filter(x => x.workshop_id === ws).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const outstanding = rows.reduce((n, x) => n + x.net_amount - paidFor(s, x.id), 0);
    assert(amount <= outstanding, 'مبلغ پرداخت بیشتر از ماندهٔ قابل پرداخت است.');
    if (manual) {
      assert(Object.entries(manual).every(([id, value]) => rows.some(r => r.id === id) && Number.isSafeInteger(value) && value >= 0 && value <= (rows.find(r => r.id === id)!.net_amount - paidFor(s, id))), 'تخصیص دستی برای یکی از ردیف‌ها نامعتبر یا بیشتر از مانده است.');
      assert(Object.values(manual).reduce((sum, value) => sum + value, 0) === amount, 'مجموع تخصیص دستی باید دقیقاً برابر مبلغ پرداخت باشد.');
    }
    const id = makeId(); let remaining = amount;
    for (const row of rows) { const open = row.net_amount - paidFor(s, row.id); const take = manual ? (manual[row.id] ?? 0) : Math.min(open, remaining); if (take > 0) { tx.objectStore('payment_allocations').put({ id: makeId(), payment_id: id, wage_ledger_id: row.id, allocated_amount: take } satisfies Allocation); tx.objectStore('wage_ledger').put({ ...row, payment_status: take === open ? 'paid' : 'partial' }); remaining -= take; } if (!remaining) break; }
    assert(remaining === 0, 'تخصیص پرداخت کامل نیست.');
    tx.objectStore('payments').put({ id, serial: suggestSerial('P', day, s.payments), workshop_id: ws, payment_date: day, amount, method, reference, note, created_by_role: role, created_at: now() } satisfies Payment); audit(tx, 'payment', id, 'created', role);
  });
}
