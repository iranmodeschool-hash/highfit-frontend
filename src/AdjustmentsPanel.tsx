import { useEffect, useState } from 'react';
import { productForLine, type AppData } from './data';
import CodeText from './CodeText';
import { approveWageAdjustment, loadOperations, paidFor, requestWageAdjustment, type Snapshot } from './operations';

const card = 'rounded-2xl border border-[#dfe5eb] bg-white p-4 shadow-[0_2px_14px_rgba(23,43,69,0.05)] dark:border-slate-700 dark:bg-[#1b293b]';
const field = 'mt-1 min-h-11 w-full rounded-xl border border-[#cbd5df] bg-white px-3 py-2 text-[#172B45] dark:border-slate-600 dark:bg-[#24364b] dark:text-white';
const button = 'min-h-11 rounded-xl bg-[#172B45] px-5 font-bold text-white transition hover:bg-[#254361] disabled:opacity-50 dark:bg-[#E99A35] dark:text-[#172B45] dark:hover:bg-[#f3b65d]';
const money = (n: number) => `${n.toLocaleString('fa-IR')} تومان`;
const date = (s: string) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'medium' }).format(new Date(s));

export default function AdjustmentsPanel({ data }: { data: AppData }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [ledgerId, setLedgerId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = async () => setSnapshot(await loadOperations());
  useEffect(() => { reload().catch(e => setError(e instanceof Error ? e.message : 'خواندن تعدیل‌ها ممکن نشد.')); }, []);
  const label = (id: string) => {
    const ledger = snapshot?.ledger.find(l => l.id === id);
    if (!ledger) return 'ردیف دستمزد نامشخص';
    const source = snapshot?.lines.find(line => line.id === snapshot.deliveryLines.find(delivery => delivery.id === ledger.source_id)?.dispatch_line_id);
    const product = source && productForLine(data, source);
    const part = product?.parts.find(p => p.id === ledger.product_component_id);
    return `${data.workshops.find(w => w.id === ledger.workshop_id)?.name ?? 'کارگاه نامشخص'} · ${product?.code ?? '؟'} / ${part?.name ?? 'جزء نامشخص'} · سایز ${data.sizes.find(z => z.id === ledger.size_id)?.name ?? '؟'} · ${date(ledger.created_at)}`;
  };
  const displayLabel = (id: string) => { const ledger = snapshot?.ledger.find(l => l.id === id); if (!ledger) return 'ردیف دستمزد نامشخص'; const source = snapshot?.lines.find(line => line.id === snapshot.deliveryLines.find(delivery => delivery.id === ledger.source_id)?.dispatch_line_id); const product = source && productForLine(data, source); return <>{data.workshops.find(w => w.id === ledger.workshop_id)?.name ?? 'کارگاه نامشخص'} · <CodeText value={product?.code ?? '؟'}/> / {product?.parts.find(p => p.id === ledger.product_component_id)?.name ?? 'جزء نامشخص'} · سایز {data.sizes.find(z => z.id === ledger.size_id)?.name ?? '؟'} · {date(ledger.created_at)}</>; };
  async function run(work: () => Promise<void>, success: string) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await work(); await reload(); setMessage(success); setAmount(''); setReason(''); setLedgerId(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'عملیات انجام نشد.'); }
    finally { setBusy(false); }
  }
  const rows = snapshot?.adjustments.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)) ?? [];
  return <div data-testid="adjustments-panel" className="space-y-4">
    {error && <p role="alert" data-testid="adjustment-error" className="rounded-xl bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
    {message && <p role="status" data-testid="adjustment-success" className="rounded-xl bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{message}</p>}
    {!snapshot && <div className={card}>در حال خواندن تعدیل‌ها… <button data-testid="adjustment-retry" className="underline" onClick={() => void reload().then(() => setError('')).catch(e => setError(String(e)))}>تلاش دوباره</button></div>}
    {snapshot && <>
      <form data-testid="adjustment-form" className={card + ' space-y-4'} onSubmit={e => { e.preventDefault(); void run(() => requestWageAdjustment('manager', ledgerId, Number(amount), reason), 'درخواست تعدیل ثبت شد؛ تا تأیید مجدد اثری بر دستمزد ندارد.'); }}>
        <h2 className="text-lg font-bold">تعدیل جدید دستمزد</h2>
        <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">مبلغ مثبت به دستمزد اضافه و مبلغ منفی از آن کم می‌شود. ردیف اصلی دست‌نخورده می‌ماند و سابقهٔ تعدیل جدا ثبت می‌شود.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label>ردیف دستمزد<select required data-testid="adjustment-ledger" className={field} value={ledgerId} onChange={e => setLedgerId(e.target.value)}><option value="">انتخاب کنید</option>{snapshot.ledger.map(l => <option key={l.id} value={l.id}>{label(l.id)} · خالص {money(l.net_amount)} · مانده {money(l.net_amount - paidFor(snapshot, l.id))}</option>)}</select></label>
          <label>مقدار تغییر (تومان؛ مثبت یا منفی)<input required data-testid="adjustment-amount" type="number" step="1" className={field} value={amount} onChange={e => setAmount(e.target.value)}/></label>
        </div>
        <label className="block">دلیل تعدیل<textarea required maxLength={500} data-testid="adjustment-reason" className={field} value={reason} onChange={e => setReason(e.target.value)}/></label>
        <button disabled={busy || !snapshot.ledger.length || !ledgerId || !reason.trim() || !amount || Number(amount) === 0} data-testid="adjustment-submit" className={button}>ثبت درخواست تعدیل</button>
        {!snapshot.ledger.length && <p className="text-sm">هنوز دستمزدی برای تعدیل ثبت نشده است.</p>}
      </form>
      <section data-testid="adjustment-list" className="space-y-3"><h2 className="text-lg font-bold">سابقهٔ تعدیل‌ها</h2>
        {rows.map(a => <article key={a.id} data-testid={`adjustment-${a.id}`} className={card + ' space-y-2'}><b>{displayLabel(a.target_id)}</b><p className="text-sm">{date(a.created_at)} · {a.amount > 0 ? '+' : '−'}{money(Math.abs(a.amount))} · {a.status === 'approved' ? 'تأییدشده' : 'در انتظار تأیید'}</p><p className="text-sm">{a.reason}{a.repair_return_id ? ' · ثبت خودکار از مرجوعی تعمیراتی' : ''}</p>{a.status === 'pending' && <button disabled={busy} data-testid={`adjustment-approve-${a.id}`} className={button} onClick={() => { if (window.confirm('این تعدیل تأیید و در ماندهٔ دستمزد اعمال شود؟')) void run(() => approveWageAdjustment('manager', a.id), 'تعدیل تأیید و در ماندهٔ دستمزد اعمال شد.'); }}>تأیید و اعمال تعدیل</button>}</article>)}
        {!rows.length && <p className={card}>هنوز تعدیلی ثبت نشده است.</p>}
      </section>
    </>}
  </div>;
}
