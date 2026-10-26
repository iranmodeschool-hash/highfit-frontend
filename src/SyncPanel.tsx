import { useEffect, useRef, useState } from 'react';
import { CircleAlert, CloudOff, CloudUpload, Download, RotateCcw } from 'lucide-react';
import type { AppData } from './data';
import { loadOperations, loadSyncQueue, saveDispatch, simulateSync, suggestSerial, type SyncEntry } from './operations';

type Connection = 'offline' | 'online';
const box = 'rounded-2xl border border-[#dfe5eb] bg-white p-5 shadow-[0_2px_14px_rgba(23,43,69,0.05)] dark:border-slate-700 dark:bg-[#1b293b]';
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#cbd5df] bg-white px-4 font-medium text-[#172B45] transition hover:border-[#172B45] hover:bg-[#edf2f6] disabled:opacity-50 dark:border-slate-600 dark:bg-[#1b293b] dark:text-white dark:hover:border-[#E99A35] dark:hover:bg-[#24364b]';
const primary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#172B45] px-5 font-bold text-white transition hover:bg-[#254361] disabled:opacity-50 dark:bg-[#E99A35] dark:text-[#172B45] dark:hover:bg-[#f3b65d]';
const names: Record<string, string> = { dispatch: 'حواله', workshop_receipt: 'دریافت کارگاه', sewing_delivery: 'تحویل دوخت', payment: 'پرداخت', cut_defect: 'خرابی برش', repair_return: 'مرجوعی تعمیراتی', adjustment: 'تعدیل', workshop: 'کارگاه', product: 'محصول', size: 'سایز', rate: 'نرخ' };
const showDate = (value: string) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export default function SyncPanel({ data, onChanged }: { data: AppData; onChanged: () => Promise<void> }) {
  const [rows, setRows] = useState<SyncEntry[]>([]);
  const [connection, setConnection] = useState<Connection>('offline');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const active = useRef(true);
  const connectionRef = useRef<Connection>('offline');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    active.current = true;
    loadSyncQueue().then(found => { if (active.current) setRows(found); }).catch(e => { if (active.current) setError(e instanceof Error ? e.message : 'خواندن صف ممکن نشد.'); }).finally(() => { if (active.current) setLoading(false); });
    return () => { active.current = false; if (timer.current) clearTimeout(timer.current); };
  }, []);
  async function reload() {
    try { setError(''); setRows(await loadSyncQueue()); }
    catch (e) { setError(e instanceof Error ? e.message : 'خواندن صف ممکن نشد.'); }
  }
  async function send() {
    if (busy) return;
    if (connection !== 'online') { setError('برای آزمایش ارسال، ابتدا حالت آنلاینِ شبیه‌سازی را انتخاب کنید.'); return; }
    const ids = rows.filter(r => r.status === 'pending').map(r => r.id);
    if (!ids.length) { setNotice('عملیات در انتظاری وجود ندارد.'); return; }
    setBusy(true); setError(''); setNotice('');
    await new Promise<void>(resolve => { timer.current = setTimeout(resolve, 2000); });
    if (!active.current) return;
    try {
      if (connectionRef.current !== 'online') throw new Error('حالت شبیه‌سازی آفلاین است؛ صف بدون تغییر باقی ماند.');
      const count = await simulateSync(ids);
      if (!active.current) return;
      await reload();
      setNotice(`${count.toLocaleString('fa-IR')} عملیات به‌صورت محلی «همگام‌شده» علامت خورد؛ هیچ داده‌ای ارسال نشد.`);
    } catch (e) { if (active.current) setError(e instanceof Error ? e.message : 'آزمایش ارسال انجام نشد.'); }
    finally { if (active.current) setBusy(false); }
  }
  async function receiveSample() {
    if (busy) return;
    const workshop = data.workshops.find(w => w.active);
    const product = data.products.find(p => p.active && p.parts.some(part => part.active));
    const part = product?.parts.find(p => p.active);
    const size = data.sizes.find(s => s.active);
    if (!workshop || !part || !size) { setError('برای ساخت حوالهٔ نمونه، یک کارگاه، محصول با جزء فعال و سایز فعال لازم است.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const snapshot = await loadOperations();
      const day = new Date().toISOString().slice(0, 10);
      await saveDispatch('manager', workshop.id, { serial: suggestSerial('D', day, snapshot.dispatches), dispatch_date: day, workshop_id: workshop.id, origin_center: 'مرکز نمونهٔ آزمایش اتصال', note: 'پیش‌نویس آزمایشی محلی؛ از سرور دریافت نشده است.', lines: [{ id: crypto.randomUUID(), product_component_id: part.id, quantities: { [size.id]: 1 } }] }, false, data);
      await onChanged();
      if (!active.current) return;
      await reload();
      setNotice('یک پیش‌نویس حوالهٔ نمونه در فهرست حواله‌ها ساخته شد؛ از سرور دریافت نشده و در گردش کارگاه وارد نشده است.');
    } catch (e) { if (active.current) setError(e instanceof Error ? e.message : 'ساخت حوالهٔ نمونه ممکن نشد.'); }
    finally { if (active.current) setBusy(false); }
  }
  const pending = rows.filter(r => r.status === 'pending').length;
  const last = rows.filter(r => r.synced_at).map(r => r.synced_at!).sort().at(-1);
  return <section data-testid="sync-page" className="space-y-5">
    <div className="rounded-2xl border border-[#cbd5df] bg-[#e8eef3] p-5 text-[#172B45] dark:border-slate-600 dark:bg-[#24364b] dark:text-white"><h2 className="text-lg font-extrabold">حالت شبیه‌سازی · بدون اتصال واقعی</h2></div>
    {error && <div data-testid="sync-error" role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"><CircleAlert size={18}/><span className="flex-1">{error}</span><button data-testid="sync-retry" className="underline" onClick={() => void reload()}>تلاش دوباره</button></div>}
    {notice && <div data-testid="sync-notice" role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{notice}</div>}
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2"><div className={box}><h3 className="font-bold">وضعیت فرضی اتصال</h3><p data-testid="sync-status" className="mt-3 text-lg font-extrabold">{connection === 'online' ? 'آنلاین (شبیه‌سازی)' : 'آفلاین (شبیه‌سازی)'}</p><div className="mt-4 flex flex-wrap gap-2"><button data-testid="sync-online" disabled={busy} onClick={() => { connectionRef.current = 'online'; setConnection('online'); setError(''); setNotice('اتصال موفق به‌صورت محلی شبیه‌سازی شد.'); }} className={button}><CloudUpload size={18}/> شبیه‌سازی اتصال موفق</button><button data-testid="sync-offline" onClick={() => { connectionRef.current = 'offline'; setConnection('offline'); setNotice('قطع اتصال شبیه‌سازی شد.'); }} className={button}><CloudOff size={18}/> شبیه‌سازی قطع اتصال</button></div></div><div className={box}><h3 className="font-bold">صف محلی</h3><p data-testid="sync-pending-count" className="mt-3 text-lg font-extrabold">{pending.toLocaleString('fa-IR')} عملیات در انتظار</p><p data-testid="sync-last-time" className="mt-2 text-sm text-slate-500 dark:text-slate-400">آخرین همگام‌سازی آزمایشی: {last ? showDate(last) : 'هنوز انجام نشده'}</p><div className="mt-4 flex flex-wrap gap-2"><button data-testid="sync-send" disabled={busy || loading || !pending} onClick={() => void send()} className={primary}><CloudUpload size={18}/>{busy ? 'در حال شبیه‌سازی ارسال…' : 'ارسال داده‌های در انتظار'}</button><button data-testid="sync-receive" disabled={busy} onClick={() => void receiveSample()} className={button}><Download size={18}/> دریافت حوالهٔ جدید (نمونه)</button></div></div></div>
    <div className={box}><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">عملیات صف همگام‌سازی</h3><button data-testid="sync-refresh" onClick={() => void reload()} className={button}><RotateCcw size={17}/> تازه‌سازی صف</button></div>{loading ? <p data-testid="sync-loading" className="mt-5 animate-pulse text-slate-500">در حال خواندن صف محلی…</p> : rows.length ? <ul data-testid="sync-queue" className="mt-4 max-h-96 space-y-2 overflow-y-auto">{rows.map(row => <li key={row.id} data-testid={`sync-row-${row.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700"><div className="min-w-0"><b>{names[row.doc_type] ?? row.doc_type}</b><span className="ms-2 break-all text-slate-500">{row.doc_id}</span><span className="block text-slate-500">{showDate(row.created_at)}</span></div><span className={row.status === 'synced' ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}>{row.status === 'synced' ? 'همگام‌شده (نمایشی)' : 'در انتظار'}</span></li>)}</ul> : <p data-testid="sync-empty" className="mt-5 text-sm leading-7 text-slate-500 dark:text-slate-400">صف عملیات خالی است.</p>}</div>
  </section>;
}
