import { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, RotateCcw } from 'lucide-react';
import { productForLine, type AppData } from './data';
import JalaliDateInput from './JalaliDateInput';
import { downloadDocumentPdf } from './documentPdf';
import { loadOperations, paidFor, type Snapshot } from './operations';
import RelationshipFlow from './RelationshipFlow';

type Report = 'dispatches' | 'ledger' | 'payments' | 'balances' | 'all';
const faDate = (value: string) => value ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value.slice(0, 10) + 'T12:00:00')) : '';
const card = 'rounded-2xl border border-[#dfe5eb] bg-white p-5 shadow-[0_2px_14px_rgba(23,43,69,0.05)] dark:border-slate-700 dark:bg-[#1b293b]';
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#172B45] px-5 font-bold text-white transition hover:bg-[#254361] disabled:opacity-50 dark:bg-[#E99A35] dark:text-[#172B45] dark:hover:bg-[#f3b65d]';
const titles: Record<Exclude<Report, 'all'>, string> = { dispatches: 'حواله‌ها', ledger: 'دفتر دستمزد', payments: 'پرداخت‌ها', balances: 'ماندهٔ کارگاه‌ها' };

export default function ExportsPanel({ data }: { data: AppData }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [workshopId, setWorkshopId] = useState(data.role?.kind === 'workshop' ? data.role.workshopId ?? '' : '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const manager = data.role?.kind === 'manager' || data.role?.kind === 'supervisor';
  async function reload() {
    setError('');
    try { setSnapshot(await loadOperations()); } catch (cause) { setError(cause instanceof Error ? cause.message : 'خواندن اطلاعات ممکن نشد.'); }
  }
  useEffect(() => { void reload(); }, []);
  const wsName = (id: string) => data.workshops.find(w => w.id === id)?.name ?? 'کارگاه نامشخص';
  const sizeName = (id: string) => data.sizes.find(z => z.id === id)?.name ?? 'نامشخص';
  const partInfo = (id: string, productId?: string) => { const p = productForLine(data, { product_id: productId, product_component_id: id }); return { code: p?.code ?? '', product: p?.name ?? 'نامشخص', part: p?.parts.find(x => x.id === id)?.name ?? 'نامشخص' }; };
  const matches = (ws: string, date: string) => (!workshopId || ws === workshopId) && (!from || date.slice(0, 10) >= from) && (!to || date.slice(0, 10) <= to);

  async function downloadPdf() {
    if (!snapshot || busy) return;
    if (from && to && from > to) { setError('تاریخ شروع باید پیش از تاریخ پایان باشد.'); return; }
    setBusy(true); setError(''); setNotice('');
    try { await downloadDocumentPdf('ledger', workshopId, snapshot, data, from, to); setNotice('فایل PDF در پوشهٔ دانلود ذخیره شد.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'ساخت PDF ممکن نشد.'); }
    finally { setBusy(false); }
  }
  async function download(report: Report) {
    if (!snapshot || busy) return;
    if (from && to && from > to) { setError('تاریخ شروع باید پیش از تاریخ پایان باشد.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const { default: ExcelJS } = await import('exceljs');
      const book = new ExcelJS.Workbook();
      book.creator = 'High Fit Workshop ERP';
      book.created = new Date();
      const filters = `فیلتر: ${workshopId ? wsName(workshopId) : 'همهٔ کارگاه‌ها'} | از ${faDate(from) || 'ابتدا'} تا ${faDate(to) || 'اکنون'}`;
      const add = (name: string, headers: string[], rows: (string | number)[][]) => {
        const sheet = book.addWorksheet(name, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 2 }] });
        sheet.addRow([filters]);
        sheet.mergeCells(1, 1, 1, headers.length);
        sheet.getRow(1).font = { bold: true, color: { argb: 'FF1D2D69' } };
        sheet.addRow(headers);
        const head = sheet.getRow(2);
        head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D2D69' } };
        head.alignment = { horizontal: 'right' };
        for (const row of rows) sheet.addRow(row);
        sheet.columns.forEach((column, index) => { column.width = Math.min(45, Math.max(16, headers[index].length + 8)); column.alignment = { horizontal: 'right', vertical: 'middle' }; });
        sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: Math.max(2, sheet.rowCount), column: headers.length } };
        return sheet;
      };
      const s = snapshot;
      if (report === 'dispatches' || report === 'all') {
        const rows: (string | number)[][] = [];
        for (const d of s.dispatches.filter(d => matches(d.workshop_id, d.dispatch_date))) {
          for (const l of s.lines.filter(l => l.dispatch_id === d.id)) for (const q of s.quantities.filter(q => q.dispatch_line_id === l.id)) {
            const part = partInfo(l.product_component_id, l.product_id);
            rows.push([d.serial, faDate(d.dispatch_date), wsName(d.workshop_id), d.origin_center, part.code, part.product, part.part, sizeName(q.size_id), q.qty, d.status]);
          }
        }
        add(titles.dispatches, ['شماره', 'تاریخ شمسی', 'کارگاه', 'مرکز ارسال', 'کد محصول', 'نام محصول', 'جزء', 'سایز', 'تعداد', 'وضعیت'], rows);
      }
      if (report === 'ledger' || report === 'all') {
        const rows = s.ledger.filter(l => matches(l.workshop_id, l.created_at)).map(l => {
          const sourceLine = s.lines.find(line => line.id === s.deliveryLines.find(d => d.id === l.source_id)?.dispatch_line_id);
          const part = partInfo(l.product_component_id, sourceLine?.product_id);
          return [faDate(l.created_at), wsName(l.workshop_id), part.code, part.product, part.part, sizeName(l.size_id), l.qty_base, l.rate_amount_snapshot, l.gross_amount, l.adjustment_amount, l.net_amount, paidFor(s, l.id), l.net_amount - paidFor(s, l.id)] as (string | number)[];
        });
        const sheet = add(titles.ledger, ['تاریخ شمسی', 'کارگاه', 'کد محصول', 'نام محصول', 'جزء', 'سایز', 'تعداد', 'نرخ تاریخی (تومان)', 'مبلغ ناخالص', 'تعدیل', 'مبلغ خالص', 'پرداخت‌شده', 'مانده'], rows);
        if (rows.length) { const total = sheet.addRow(['جمع']); for (const col of [7, 9, 10, 11, 12, 13]) total.getCell(col).value = { formula: `SUM(${sheet.getColumn(col).letter}3:${sheet.getColumn(col).letter}${sheet.rowCount - 1})` }; total.font = { bold: true }; }
      }
      if (report === 'payments' || report === 'all') {
        const rows: (string | number)[][] = [];
        for (const p of s.payments.filter(p => matches(p.workshop_id, p.payment_date))) {
          const allocations = s.allocations.filter(a => a.payment_id === p.id);
          if (!allocations.length) rows.push([p.serial ?? '', faDate(p.payment_date), wsName(p.workshop_id), p.amount, p.method, p.reference, '', 0]);
          else for (const [index, a] of allocations.entries()) { const l = s.ledger.find(l => l.id === a.wage_ledger_id); rows.push([p.serial ?? '', faDate(p.payment_date), wsName(p.workshop_id), index === 0 ? p.amount : '', p.method, p.reference, l ? `${partInfo(l.product_component_id, s.lines.find(line => line.id === s.deliveryLines.find(d => d.id === l.source_id)?.dispatch_line_id)?.product_id).part} / ${sizeName(l.size_id)}` : a.wage_ledger_id, a.allocated_amount]); }
        }
        add(titles.payments, ['شماره پرداخت', 'تاریخ شمسی', 'کارگاه', 'مبلغ کل پرداخت', 'روش', 'شماره پیگیری', 'ردیف دستمزد', 'مبلغ تخصیص'], rows);
      }
      if (report === 'balances' || report === 'all') {
        const rows = data.workshops.filter(w => !workshopId || w.id === workshopId).map(w => {
          const ledger = s.ledger.filter(l => l.workshop_id === w.id && (!from || l.created_at.slice(0, 10) >= from) && (!to || l.created_at.slice(0, 10) <= to));
          const gross = ledger.reduce((n, l) => n + l.net_amount, 0);
          const paid = ledger.reduce((n, l) => n + paidFor(s, l.id), 0);
          return [w.name, gross, paid, gross - paid];
        });
        add(titles.balances, ['کارگاه', 'دستمزد خالص (تومان)', 'تخصیص پرداخت (تومان)', 'مانده (تومان)'], rows);
      }
      const bytes = await book.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a'); link.href = url; link.download = `high-fit-${report}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setNotice('فایل Excel در پوشهٔ دانلود ذخیره شد.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ساخت فایل Excel ممکن نشد.'); }
    finally { setBusy(false); }
  }
  return <section data-testid="exports-page" className="space-y-5">
    <RelationshipFlow data={data} snapshot={snapshot}/>
    <div className={card}><h2 className="flex items-center gap-2 text-lg font-bold"><FileSpreadsheet size={22}/> خروجی‌های واقعی Excel</h2>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">{manager && <label className="text-sm">کارگاه<select data-testid="export-workshop" value={workshopId} onChange={e => setWorkshopId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-800"><option value="">همهٔ کارگاه‌ها</option>{data.workshops.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>}<div className="text-sm">از تاریخ شمسی<JalaliDateInput testId="export-from" value={from} onChange={setFrom} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-800"/><button data-testid="export-clear-from" type="button" className="mt-1 text-sm underline" onClick={() => setFrom('')}>پاک کردن</button></div><div className="text-sm">تا تاریخ شمسی<JalaliDateInput testId="export-to" value={to} onChange={setTo} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-800"/><button data-testid="export-clear-to" type="button" className="mt-1 text-sm underline" onClick={() => setTo('')}>پاک کردن</button></div></div>
      {from && <p className="mt-2 text-sm">از {faDate(from)} {to && `تا ${faDate(to)}`}</p>}
    </div>
    {error && <div data-testid="export-error" role="alert" className="rounded-xl bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">{error} <button data-testid="export-retry" className="underline" onClick={() => void reload()}>تلاش دوباره</button></div>}
    {notice && <p data-testid="export-success" role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{notice}</p>}
    {!snapshot && !error && <p className={card}>در حال خواندن گزارش‌ها…</p>}
    {snapshot && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{([...Object.keys(titles), ...(manager ? ['all'] : [])] as Report[]).map(key => <div key={key} className={card}><h3 className="font-bold">{key === 'all' ? 'گزارش جامع مدیر' : titles[key]}</h3><button data-testid={`export-${key}`} type="button" disabled={busy} onClick={() => void download(key)} className={button + ' mt-4'}><Download size={18}/>{busy ? 'در حال آماده‌سازی…' : 'خروجی Excel'}</button></div>)}</div>}
    <div className={card}><h3 className="font-bold">دفتر دستمزد PDF</h3><div className="mt-4 flex flex-wrap gap-2"><button data-testid="export-ledger-pdf" type="button" disabled={!snapshot || busy} className={button} onClick={() => void downloadPdf()}><Download size={18}/>{busy ? 'در حال آماده‌سازی…' : 'چاپ PDF دفتر دستمزد'}</button><button data-testid="exports-reload" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 dark:border-slate-600" onClick={() => void reload()}><RotateCcw size={17}/> بارگذاری دوباره</button></div></div>
  </section>;
}
