import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CircleAlert, ClipboardCheck, ClipboardList, Factory, RotateCcw, Wallet } from 'lucide-react';
import { productForLine, type AppData } from './data';
import JalaliDateInput from './JalaliDateInput';
import { loadOperations, paidFor, receivedFor, type Snapshot } from './operations';

const card = 'rounded-2xl border border-[#dfe5eb] bg-white p-4 shadow-[0_2px_14px_rgba(23,43,69,0.05)] dark:border-slate-700 dark:bg-[#1b293b] sm:p-5';
const control = 'min-h-11 w-full rounded-xl border border-[#cbd5df] bg-white px-3 text-[#172B45] dark:border-slate-600 dark:bg-[#24364b] dark:text-white';
const number = (value: number) => value.toLocaleString('fa-IR');
const inPeriod = (day: string, from: string, to: string) => (!from || day.slice(0, 10) >= from) && (!to || day.slice(0, 10) <= to);

type WorkshopRow = { id: string; name: string; assigned: number; accepted: number; defects: number; shortage: number; balance: number | null; open: number; pending: number; pendingDelivery: number };
type Alert = { key: string; title: string; reason: string; workshop: string; page: 'dispatches' | 'receipts' | 'delivery' | 'defects'; id: string; tone: 'warning' | 'info' };
type Comparison = { componentId: string; label: string; rows: { id: string; name: string; assigned: number; accepted: number }[] };

export default function ProductionOverview({ data, onNavigate, refreshKey }: { data: AppData; onNavigate: (page: 'dispatches' | 'receipts' | 'delivery' | 'defects' | 'income', id?: string) => void; refreshKey: number }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [workshopId, setWorkshopId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [comparisonPart, setComparisonPart] = useState('');
  const manager = data.role?.kind === 'manager';
  const canSeeAll = manager || data.role?.kind === 'supervisor';
  const canNavigate = (page: 'dispatches' | 'receipts' | 'delivery' | 'defects' | 'income') => canSeeAll || ['dispatches', 'receipts', 'defects'].includes(page);
  useEffect(() => {
    let active = true;
    loadOperations().then(value => { if (active) { setSnapshot(value); setError(''); } }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'خواندن اسناد ممکن نشد.'); });
    return () => { active = false; };
  }, [refreshKey, reloadKey]);
  const selected = canSeeAll ? workshopId : data.role?.workshopId ?? '';
  const report = useMemo(() => {
    if (!snapshot) return null;
    const s = snapshot;
    const dispatchById = new Map(s.dispatches.map(d => [d.id, d]));
    const lineById = new Map(s.lines.map(l => [l.id, l]));
    const receiptById = new Map(s.receipts.map(r => [r.id, r]));
    const deliveryById = new Map(s.deliveries.map(d => [d.id, d]));
    const rows = data.workshops.filter(w => canSeeAll ? !selected || selected === w.id : w.id === selected).map(w => {
      const dispatchIds = new Set(s.dispatches.filter(d => d.workshop_id === w.id && d.status !== 'draft' && d.status !== 'cancelled' && inPeriod(d.dispatch_date, from, to)).map(d => d.id));
      const assigned = s.quantities.reduce((sum, q) => sum + (dispatchIds.has(lineById.get(q.dispatch_line_id)?.dispatch_id ?? '') ? q.qty : 0), 0);
      const accepted = s.deliveryLines.reduce((sum, l) => { const delivery = deliveryById.get(l.delivery_id); return sum + (delivery?.workshop_id === w.id && delivery.status === 'approved' && inPeriod(delivery.delivery_date, from, to) ? l.qty_accepted ?? 0 : 0); }, 0);
      const defects = s.defects.reduce((sum, d) => sum + (dispatchById.get(d.dispatch_id)?.workshop_id === w.id && d.status === 'approved' && inPeriod(d.reviewed_at ?? d.created_at, from, to) ? d.approved_qty ?? 0 : 0), 0);
      const shortage = s.receiptLines.reduce((sum, l) => { const receipt = receiptById.get(l.receipt_id); return sum + (receipt?.status === 'approved' && dispatchById.get(receipt.dispatch_id)?.workshop_id === w.id && inPeriod(receipt.received_date, from, to) ? Math.max(0, l.declared_qty - l.actual_qty) : 0); }, 0);
      const ledger = s.ledger.filter(l => l.workshop_id === w.id);
      const balance = ledger.length ? ledger.reduce((sum, l) => sum + l.net_amount - paidFor(s, l.id), 0) : null;
      const pendingDelivery = s.deliveries.filter(d => d.workshop_id === w.id && d.status === 'pending_approval' && inPeriod(d.delivery_date, from, to)).length;
      const open = s.dispatches.filter(d => d.workshop_id === w.id && (d.status === 'issued' || d.status === 'partial_received') && inPeriod(d.dispatch_date, from, to)).length;
      const pending = s.receipts.filter(r => r.status === 'pending_manager' && dispatchById.get(r.dispatch_id)?.workshop_id === w.id && inPeriod(r.received_date, from, to)).length + s.deliveries.filter(d => d.workshop_id === w.id && d.status === 'pending_approval' && inPeriod(d.delivery_date, from, to)).length + s.defects.filter(d => dispatchById.get(d.dispatch_id)?.workshop_id === w.id && (d.status === 'declared' || d.status === 'pending_manager') && inPeriod(d.created_at, from, to)).length;
      return { id: w.id, name: w.name, assigned, accepted, defects, shortage, balance, open, pending, pendingDelivery } satisfies WorkshopRow;
    });
    const totals = rows.reduce((a, r) => ({ assigned: a.assigned + r.assigned, accepted: a.accepted + r.accepted, defects: a.defects + r.defects, shortage: a.shortage + r.shortage, balance: a.balance + (r.balance ?? 0), hasLedger: a.hasLedger || r.balance !== null, open: a.open + r.open, pending: a.pending + r.pending, pendingDelivery: a.pendingDelivery + r.pendingDelivery }), { assigned: 0, accepted: 0, defects: 0, shortage: 0, balance: 0, hasLedger: false, open: 0, pending: 0, pendingDelivery: 0 });
    const received = s.receiptLines.reduce((sum, l) => { const receipt = receiptById.get(l.receipt_id); return sum + (receipt?.status === 'approved' && rows.some(w => w.id === dispatchById.get(receipt.dispatch_id)?.workshop_id) && inPeriod(receipt.received_date, from, to) ? l.actual_qty : 0); }, 0);
    const allowed = new Set(rows.map(w => w.id));
    const alerts: Alert[] = [];
    const add = (alert: Alert) => alerts.push(alert);
    for (const d of s.dispatches) {
      if (!allowed.has(d.workshop_id) || !inPeriod(d.dispatch_date, from, to) || ['draft', 'cancelled'].includes(d.status)) continue;
      const pendingReceipt = s.receipts.some(r => r.dispatch_id === d.id && r.status === 'pending_manager');
      if (pendingReceipt) continue; // the receipt itself has the actionable warning
      const gap = s.quantities.filter(q => lineById.get(q.dispatch_line_id)?.dispatch_id === d.id).reduce((sum, q) => sum + Math.max(0, q.qty - receivedFor(s, q.dispatch_line_id, q.size_id)), 0);
      if (gap > 0) add({ key: `dispatch-${d.id}`, title: d.status === 'fully_received' ? 'وضعیت حواله نیازمند بررسی' : 'ارسالِ دریافت‌نشده', reason: `${number(gap)} عدد از حوالهٔ ${d.serial} هنوز دریافت تأییدشده ندارد${d.status === 'fully_received' ? '، با وجود وضعیت دریافت کامل' : ''}.`, workshop: data.workshops.find(w => w.id === d.workshop_id)?.name ?? 'پیمانکار نامشخص', page: 'dispatches', id: d.id, tone: d.status === 'fully_received' ? 'warning' : 'info' });
    }
    for (const r of s.receipts) {
      const d = dispatchById.get(r.dispatch_id);
      if (r.status === 'pending_manager' && d && allowed.has(d.workshop_id) && inPeriod(r.received_date, from, to)) add({ key: `receipt-${r.id}`, title: 'مغایرت دریافت در انتظار تأیید', reason: `رسید ${r.serial ?? d.serial}: تعداد اعلامی و واقعی برابر نیست.`, workshop: data.workshops.find(w => w.id === d.workshop_id)?.name ?? 'پیمانکار نامشخص', page: 'receipts', id: r.id, tone: 'warning' });
    }
    for (const d of s.deliveries) {
      if (!allowed.has(d.workshop_id) || !inPeriod(d.delivery_date, from, to)) continue;
      if (d.status === 'pending_approval' || d.status === 'needs_revision') add({ key: `delivery-${d.id}`, title: d.status === 'pending_approval' ? 'تحویل در انتظار تأیید' : 'تحویل نیازمند اصلاح', reason: `سند ${d.serial ?? 'تحویل'}${d.reject_reason ? `: ${d.reject_reason}` : d.status === 'pending_approval' ? ' هنوز بررسی نشده است.' : ' برای اصلاح برگشت داده شده است.'}`, workshop: data.workshops.find(w => w.id === d.workshop_id)?.name ?? 'پیمانکار نامشخص', page: 'delivery', id: d.id, tone: 'warning' });
    }
    for (const defect of s.defects) {
      const d = dispatchById.get(defect.dispatch_id);
      if (!d || !allowed.has(d.workshop_id) || !inPeriod(defect.created_at, from, to) || !['declared', 'pending_manager'].includes(defect.status)) continue;
      add({ key: `defect-${defect.id}`, title: 'خرابی / کسری برش در انتظار بررسی', reason: `${number(defect.declared_qty)} عدد از حوالهٔ ${d.serial} اعلام شده و هنوز تعیین‌تکلیف نشده است.`, workshop: data.workshops.find(w => w.id === d.workshop_id)?.name ?? 'پیمانکار نامشخص', page: 'defects', id: defect.id, tone: 'warning' });
    }
    // Compare only a shared component and the same cohort of issued dispatches.
    // Acceptance is tied to those dispatch lines, even when the delivery date falls outside the dispatch period.
    const cohorts = new Map<string, Map<string, { id: string; name: string; assigned: number; accepted: number }>>();
    if (canSeeAll && !selected) for (const d of s.dispatches) {
      if (!allowed.has(d.workshop_id) || ['draft', 'cancelled'].includes(d.status) || !inPeriod(d.dispatch_date, from, to)) continue;
      for (const line of s.lines.filter(l => l.dispatch_id === d.id)) {
        const product = productForLine(data, line);
        const part = product?.parts.find(part => part.id === line.product_component_id);
        const cohortKey = `${product?.id ?? ''}:${part?.componentId ?? line.product_component_id}`;
        const byWorkshop = cohorts.get(cohortKey) ?? new Map();
        const prev = byWorkshop.get(d.workshop_id) ?? { id: d.workshop_id, name: data.workshops.find(w => w.id === d.workshop_id)?.name ?? 'پیمانکار نامشخص', assigned: 0, accepted: 0 };
        prev.assigned += s.quantities.filter(q => q.dispatch_line_id === line.id).reduce((n, q) => n + q.qty, 0);
        prev.accepted += s.deliveryLines.filter(l => l.dispatch_line_id === line.id && deliveryById.get(l.delivery_id)?.status === 'approved').reduce((n, l) => n + (l.qty_accepted ?? 0), 0);
        byWorkshop.set(d.workshop_id, prev); cohorts.set(cohortKey, byWorkshop);
      }
    }
    const comparisons: Comparison[] = [...cohorts].filter(([, group]) => [...group.values()].filter(r => r.assigned > 0).length >= 2).map(([componentId, group]) => ({ componentId, label: (() => { const [productId, catalogId] = componentId.split(':'); const product = data.products.find(p => p.id === productId); const part = product?.parts.find(p => (p.componentId ?? p.id) === catalogId); return `${product?.code ?? '؟'} — ${part?.name ?? 'جزء نامشخص'}`; })(), rows: [...group.values()].filter(r => r.assigned > 0) }));
    return { rows, totals, received, alerts, comparisons };
  }, [snapshot, data.workshops, canSeeAll, selected, from, to]);
  const invalid = Boolean(from && to && from > to);
  const metrics = report ? [
    { label: 'حوالهٔ باز', value: number(report.totals.open), icon: ClipboardList, target: 'dispatches' as const },
    { label: 'ارسال ثبت‌شده', value: number(report.totals.assigned), icon: Factory, target: 'dispatches' as const },
    { label: 'دریافت تأییدشده', value: number(report.received), icon: ClipboardCheck, target: 'receipts' as const },
    { label: 'تحویل پذیرفته‌شده', value: number(report.totals.accepted), icon: ClipboardCheck, target: 'delivery' as const },
    { label: 'تحویل در انتظار تأیید', value: number(report.totals.pendingDelivery), icon: ClipboardCheck, target: 'delivery' as const },
    { label: 'نیازمند رسیدگی', value: number(report.totals.pending), icon: CircleAlert, target: 'delivery' as const },
    { label: 'ماندهٔ دستمزد · کل دوره‌ها', value: report.totals.hasLedger ? `${number(report.totals.balance)} تومان` : 'سند ندارد', icon: Wallet, target: 'income' as const },
  ] : [];
  return <section data-testid="production-overview" className="mt-6 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-extrabold">پایش تولید و پیمانکاران</h2><p className="text-sm text-slate-500 dark:text-slate-300">آمار اسناد ثبت‌شده روی این دستگاه</p></div><button data-testid="overview-reload" type="button" onClick={() => { setSnapshot(null); setError(''); setReloadKey(n => n + 1); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"><RotateCcw size={17}/> به‌روزرسانی</button></div>
    <div className={card + ' grid grid-cols-1 gap-3 sm:grid-cols-3'}>{canSeeAll && <label className="text-sm font-medium">پیمانکار<select data-testid="overview-workshop" value={workshopId} onChange={e => setWorkshopId(e.target.value)} className={control + ' mt-1'}><option value="">همهٔ پیمانکاران</option>{data.workshops.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>}<div className="text-sm font-medium">از تاریخ شمسی<JalaliDateInput testId="overview-from" value={from} onChange={setFrom} className={control + ' mt-1'}/>{from && <button data-testid="overview-clear-from" onClick={() => setFrom('')} className="mt-1 min-h-11 text-sm underline">پاک کردن</button>}</div><div className="text-sm font-medium">تا تاریخ شمسی<JalaliDateInput testId="overview-to" value={to} onChange={setTo} className={control + ' mt-1'}/>{to && <button data-testid="overview-clear-to" onClick={() => setTo('')} className="mt-1 min-h-11 text-sm underline">پاک کردن</button>}</div></div>
    {invalid && <p data-testid="overview-date-error" role="alert" className="rounded-xl bg-red-50 p-3 text-red-800 dark:bg-red-950 dark:text-red-200">تاریخ شروع باید پیش از تاریخ پایان باشد.</p>}
    {error && <div data-testid="overview-error" role="alert" className={card + ' text-red-700 dark:text-red-300'}>{error}<button data-testid="overview-retry" onClick={() => { setError(''); setReloadKey(n => n + 1); }} className="ms-3 min-h-11 underline">تلاش دوباره</button></div>}
    {!snapshot && !error && <div data-testid="overview-loading" className={card + ' animate-pulse text-slate-500'}>در حال خواندن اسناد تولید…</div>}
    {report && !invalid && <><div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{metrics.filter(m => canNavigate(m.target)).map(m => <button key={m.label} data-testid={`overview-${m.target}-${m.label}`} onClick={() => onNavigate(m.target)} className={card + ' min-w-0 text-right transition hover:border-[#E99A35] focus-visible:outline-2 focus-visible:outline-[#E99A35]'}><m.icon size={21} className="text-[#172B45] dark:text-[#E99A35]"/><span className="mt-3 block text-sm text-slate-600 dark:text-slate-300">{m.label}</span><strong className="mt-1 block break-words text-xl font-extrabold sm:text-2xl">{m.value}</strong><ArrowLeft size={15} className="mt-2 text-slate-400"/></button>)}</div><section data-testid="overview-followups" className={card}><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 font-bold"><CircleAlert size={20} className="text-[#E99A35]"/> موارد نیازمند پیگیری</h3><span className="text-sm text-slate-500 dark:text-slate-300">{number(report.alerts.length)} مورد در بازهٔ انتخابی</span></div>{report.alerts.length ? <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">{report.alerts.filter(a => canNavigate(a.page)).map(a => <article key={a.key} data-testid={`followup-${a.key}`} className={`min-w-0 rounded-xl border p-3 ${a.tone === 'warning' ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30' : 'border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-[#24364b]'}`}><div className="flex flex-wrap items-start justify-between gap-2"><b>{a.title}</b><span className="text-sm text-slate-600 dark:text-slate-300">{a.workshop}</span></div><p className="mt-1 break-words text-sm leading-7">{a.reason}</p><button type="button" data-testid={`followup-open-${a.key}`} onClick={() => onNavigate(a.page, a.id)} className="mt-2 inline-flex min-h-11 items-center gap-2 font-bold text-[#172B45] underline dark:text-[#E99A35]">مشاهدهٔ سند <ArrowLeft size={16}/></button></article>)}</div> : <p data-testid="followup-empty" className="mt-3 text-sm text-slate-500 dark:text-slate-300">موردی برای پیگیری ثبت نشده است.</p>}</section>{canSeeAll && !selected && <section data-testid="overview-comparison" className={card}><h3 className="font-bold">مقایسهٔ هم‌نوعِ کار ارجاعی</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-300">فقط اجزای یکسان در حواله‌های صادرشدهٔ بازه؛ تحویل پذیرفته‌شدهٔ همان حواله‌ها، حتی اگر تاریخ تحویل خارج از بازه باشد. اعداد رتبه یا شاخص کیفیت نیستند.</p>{report.comparisons.length ? <><label className="mt-3 block text-sm font-medium">جزء کالا<select data-testid="comparison-part" className={control + ' mt-1'} value={report.comparisons.some(c => c.componentId === comparisonPart) ? comparisonPart : report.comparisons[0].componentId} onChange={e => setComparisonPart(e.target.value)}>{report.comparisons.map(c => <option key={c.componentId} value={c.componentId}>{c.label}</option>)}</select></label><div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">{(report.comparisons.find(c => c.componentId === comparisonPart) ?? report.comparisons[0]).rows.map(r => <div key={r.id} data-testid={`comparison-workshop-${r.id}`} className="rounded-xl border border-[#dfe5eb] bg-[#f8fafb] p-3 dark:border-slate-600 dark:bg-[#24364b]"><b>{r.name}</b><p className="mt-1 text-sm">ارجاع: {number(r.assigned)} · تحویل پذیرفته: {number(r.accepted)}</p></div>)}</div></> : <p data-testid="comparison-empty" className="mt-3 text-sm text-slate-500 dark:text-slate-300">جزء مشترک با ارجاع ثبت‌شده در حداقل دو کارگاه یافت نشد.</p>}</section>}<div className={card}><h3 className="font-bold">عملکرد پیمانکاران</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-300">ارسال بر پایهٔ حوالهٔ صادرشده؛ دریافت و کسری بر پایهٔ رسید تأییدشده؛ تحویل بر پایهٔ تعداد پذیرفته‌شده. خرابی فقط تأییدشده است. ماندهٔ دستمزد کل دوره‌هاست و از دفتر دستمزد منهای تخصیص پرداخت به دست می‌آید.</p>{report.rows.length ? <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">{report.rows.map(w => <article key={w.id} data-testid={`overview-workshop-${w.id}`} className="min-w-0 rounded-xl border border-[#dfe5eb] bg-[#f8fafb] p-4 dark:border-slate-600 dark:bg-[#24364b]"><div className="flex flex-wrap items-start justify-between gap-2"><h4 className="font-bold">{w.name}</h4><span className="rounded-full bg-white px-3 py-1 text-sm dark:bg-slate-700">{number(w.open)} حوالهٔ باز</span></div><div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm"><span>ارجاع: <b>{number(w.assigned)}</b></span><span>تحویل پذیرفته: <b>{number(w.accepted)}</b></span><span>خرابی تأییدشده: <b>{number(w.defects)}</b></span><span>کسری دریافت: <b>{number(w.shortage)}</b></span><span>نیازمند رسیدگی: <b>{number(w.pending)}</b></span><span className="break-words">ماندهٔ کل: <b>{w.balance === null ? 'سند ندارد' : `${number(w.balance)} تومان`}</b></span></div><button data-testid={`overview-workshop-details-${w.id}`} onClick={() => onNavigate('dispatches')} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#172B45] underline dark:text-[#E99A35]">مشاهدهٔ حواله‌ها <ArrowLeft size={16}/></button></article>)}</div> : <p data-testid="overview-empty" className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Factory size={20}/> پیمانکاری یافت نشد.</p>}</div></>}
  </section>;
}
