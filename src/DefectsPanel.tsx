import { useEffect, useState } from 'react';
import { productForLine, type AppData } from './data';
import CodeText from './CodeText';
import { declareCutDefect, loadOperations, reviewCutDefect, receivedFor, sewableFor, acceptedFor, type CutDefect, type Snapshot } from './operations';

const card = 'rounded-2xl border border-[#dfe5eb] bg-white p-4 shadow-[0_2px_14px_rgba(23,43,69,0.05)] dark:border-slate-700 dark:bg-[#1b293b]';
const field = 'mt-1 min-h-11 w-full rounded-xl border border-[#cbd5df] bg-white px-3 py-2 text-[#172B45] dark:border-slate-600 dark:bg-[#24364b] dark:text-white';
const button = 'min-h-11 rounded-xl bg-[#172B45] px-5 font-bold text-white transition hover:bg-[#254361] disabled:opacity-50 dark:bg-[#E99A35] dark:text-[#172B45] dark:hover:bg-[#f3b65d]';
const kinds: Record<CutDefect['defect_type'], string> = { fabric: 'پارچه', cut: 'برش', shortage: 'کسری', damage: 'آسیب', other: 'سایر' };
const responsibilities: Record<CutDefect['responsibility'], string> = { factory: 'کارخانه', workshop: 'کارگاه', supplier: 'تأمین‌کننده', unknown: 'نامشخص' };
const decisions = { approved: 'تأیید', rejected: 'رد', pending_manager: 'بررسی بیشتر', replacement: 'تعویض', recut: 'برش مجدد', scrapped: 'اسقاط' } as const;
type Decision = keyof typeof decisions;
const date = (value: string) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'medium' }).format(new Date(value));

export default function DefectsPanel({ data, initialDispatchId = '', initialDefectId = '' }: { data: AppData; initialDispatchId?: string; initialDefectId?: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [dispatchId, setDispatchId] = useState(initialDispatchId);
  const [lineId, setLineId] = useState(''); const [sizeId, setSizeId] = useState(''); const [quantity, setQuantity] = useState('');
  const [kind, setKind] = useState<CutDefect['defect_type']>('fabric');
  const [responsibility, setResponsibility] = useState<CutDefect['responsibility']>('unknown');
  const [note, setNote] = useState(''); const [reviews, setReviews] = useState<Record<string, { count: string; decision: Decision; note: string }>>({});
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const manager = data.role?.kind === 'manager'; const workshop = data.role?.kind === 'workshop'; const canSeeAll = manager || data.role?.kind === 'supervisor'; const ws = data.role?.workshopId ?? '';
  async function reload() { setSnapshot(await loadOperations()); }
  useEffect(() => { reload().catch(e => setError(e instanceof Error ? e.message : 'خواندن خرابی‌ها ممکن نشد.')); }, []);
  useEffect(() => {
    if (!snapshot || !initialDefectId) return;
    const frame = requestAnimationFrame(() => document.querySelector(`[data-testid="defect-${initialDefectId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    return () => cancelAnimationFrame(frame);
  }, [snapshot, initialDefectId]);
  async function execute(work: () => Promise<void>, success: string) {
    if (busy) return; setBusy(true); setError(''); setMessage('');
    try { await work(); await reload(); setMessage(success); setQuantity(''); setNote(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'ثبت انجام نشد.'); }
    finally { setBusy(false); }
  }
  const dispatches = snapshot?.dispatches.filter(d => d.workshop_id === ws && ['partial_received', 'fully_received'].includes(d.status)) ?? [];
  const rows = snapshot?.lines.filter(l => l.dispatch_id === dispatchId) ?? [];
  const options = snapshot?.quantities.filter(q => q.dispatch_line_id === lineId && receivedFor(snapshot, lineId, q.size_id) > 0) ?? [];
  const label = (line: string) => {
    const source = snapshot?.lines.find(l => l.id === line);
    const partId = source?.product_component_id;
    const product = source && productForLine(data, source);
    return `${product?.code ?? '؟'} — ${product?.parts.find(x => x.id === partId)?.name ?? 'جزء نامشخص'}`;
  };
  const displayLabel = (lineId: string) => { const line = snapshot?.lines.find(l => l.id === lineId); const product = line && productForLine(data, line); return <><CodeText value={product?.code ?? '؟'}/> — {product?.parts.find(p => p.id === line?.product_component_id)?.name ?? 'جزء نامشخص'}</>; };
  const defects = snapshot?.defects.filter(x => canSeeAll || snapshot.dispatches.some(d => d.id === x.dispatch_id && d.workshop_id === ws)).sort((a, b) => b.created_at.localeCompare(a.created_at)) ?? [];
  const available = snapshot && lineId && sizeId ? sewableFor(snapshot, lineId, sizeId) - acceptedFor(snapshot, lineId, sizeId) : 0;
  return <div data-testid="cut-defects" className="space-y-4">
    {error && <p data-testid="defect-error" role="alert" className="rounded-xl bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
    {message && <p data-testid="defect-success" role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{message}</p>}
    {!snapshot && <div className={card}>در حال خواندن خرابی‌ها… <button data-testid="defect-retry" onClick={() => void reload().then(() => setError('')).catch(e => setError(String(e)))} className="underline">تلاش دوباره</button></div>}
    {snapshot && workshop && <form data-testid="defect-form" className={card + ' space-y-4'} onSubmit={e => { e.preventDefault(); void execute(() => declareCutDefect('workshop', ws, { dispatch_id: dispatchId, dispatch_line_id: lineId, size_id: sizeId, declared_qty: Number(quantity), defect_type: kind, responsibility, note }), 'خرابی ثبت شد و تا تأیید مدیر اثری بر تعداد قابل دوخت ندارد.'); }}>
      <h2 className="text-lg font-bold">اعلام خرابی برش</h2><p className="text-sm">حواله و جزء را انتخاب کنید، سپس برای همان سایز تعداد خرابی را وارد کنید.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label>حوالهٔ دریافتی<select data-testid="defect-dispatch" required className={field} value={dispatchId} onChange={e => { setDispatchId(e.target.value); setLineId(''); setSizeId(''); }}><option value="">انتخاب کنید</option>{dispatches.map(d => <option key={d.id} value={d.id}>{d.serial}</option>)}</select></label>
        <label>ردیف کالا / جزء<select data-testid="defect-line" required className={field} value={lineId} onChange={e => { setLineId(e.target.value); setSizeId(''); }}><option value="">انتخاب کنید</option>{rows.map(l => <option key={l.id} value={l.id}>{label(l.id)}</option>)}</select></label>
        <label>سایز<select data-testid="defect-size" required className={field} value={sizeId} onChange={e => setSizeId(e.target.value)}><option value="">انتخاب کنید</option>{options.map(q => <option key={q.id} value={q.size_id}>{data.sizes.find(z => z.id === q.size_id)?.name ?? 'سایز نامشخص'}</option>)}</select></label>
        <label>تعداد خرابی<input data-testid="defect-quantity" required type="number" min="1" max={Math.max(0, available ?? 0)} step="1" className={field} value={quantity} onChange={e => setQuantity(e.target.value)}/></label>
        <label>نوع خرابی<select data-testid="defect-type" className={field} value={kind} onChange={e => setKind(e.target.value as CutDefect['defect_type'])}>{Object.entries(kinds).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
        <label>مسئولیت<select data-testid="defect-responsibility" className={field} value={responsibility} onChange={e => setResponsibility(e.target.value as CutDefect['responsibility'])}>{Object.entries(responsibilities).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
      </div><p data-testid="defect-available" className="text-sm">ماندهٔ قابل دوخت این سایز: {Math.max(0, available ?? 0).toLocaleString('fa-IR')}</p>
      <label className="block">توضیحات<textarea data-testid="defect-note" maxLength={500} className={field} value={note} onChange={e => setNote(e.target.value)}/></label>
      <button data-testid="defect-submit" disabled={busy || !sizeId || !available || Number(quantity) > available} className={button}>ثبت اعلام خرابی</button>
    </form>}
    <section data-testid="defect-list" className="space-y-3"><h2 className="text-lg font-bold">{manager ? 'بررسی خرابی برش' : workshop ? 'سوابق اعلام خرابی' : 'مشاهده خرابی برش'}</h2>
      {defects.map(x => { const d = snapshot?.dispatches.find(y => y.id === x.dispatch_id); const review = reviews[x.id] ?? { count: String(x.declared_qty), decision: 'approved' as Decision, note: '' }; const update = (value: Partial<typeof review>) => setReviews(old => ({ ...old, [x.id]: { ...review, ...value } })); return <article key={x.id} data-testid={`defect-${x.id}`} className={card + ' space-y-2'}>
        <b>{d?.serial} · {displayLabel(x.dispatch_line_id)} · سایز {data.sizes.find(z => z.id === x.size_id)?.name}</b>
        <p className="text-sm leading-7">{date(x.created_at)} · اعلامی {x.declared_qty.toLocaleString('fa-IR')} · {kinds[x.defect_type]} · مسئولیت: {responsibilities[x.responsibility]} · وضعیت: {decisions[x.status as Decision] ?? x.status}{x.approved_qty !== null ? ` · تأییدی ${x.approved_qty.toLocaleString('fa-IR')}` : ''}</p>
        {x.note && <p className="text-sm">توضیح کارگاه: {x.note}</p>}{x.review_note && <p className="text-sm">توضیح مدیر: {x.review_note}</p>}
        {manager && ['declared','pending_manager'].includes(x.status) && <div className="grid grid-cols-1 gap-3 border-t border-slate-200 pt-3 dark:border-slate-700 sm:grid-cols-2">
          <label>تعداد تأییدشده<input data-testid={`defect-approved-qty-${x.id}`} type="number" min="0" max={x.declared_qty} step="1" className={field} value={review.count} onChange={e => update({ count: e.target.value })}/></label>
          <label>تصمیم<select data-testid={`defect-decision-${x.id}`} className={field} value={review.decision} onChange={e => update({ decision: e.target.value as Decision })}>{Object.entries(decisions).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
          <label className="sm:col-span-2">توضیحات بررسی<textarea data-testid={`defect-review-note-${x.id}`} maxLength={500} className={field} value={review.note} onChange={e => update({ note: e.target.value })}/></label>
          <button data-testid={`defect-review-${x.id}`} disabled={busy || !Number.isSafeInteger(Number(review.count)) || Number(review.count) < 0 || Number(review.count) > x.declared_qty || (review.decision === 'approved' && Number(review.count) === 0)} className={button} onClick={() => void execute(() => reviewCutDefect('manager', x.id, review.decision, Number(review.count), review.note), 'تصمیم خرابی ثبت شد.')}>ثبت تصمیم مدیر</button>
        </div>}
      </article>; })}
      {!defects.length && <p className={card}>هنوز خرابی برشی ثبت نشده است.</p>}
    </section>
  </div>;
}
