
import { productForLine, type AppData } from './data';
import { paidFor, type Snapshot } from './operations';

export type PdfKind = 'dispatch' | 'receipt' | 'delivery' | 'payment' | 'ledger';
type PdfBlock = { kind: 'table'; headers: string[]; rows: string[][] } | { kind: 'line'; label: string; value: string } | { kind: 'signatures'; labels: string[] };
const date = (value: string) => value ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value.slice(0, 10) + 'T12:00:00')) : '—';
const number = (value: number) => value.toLocaleString('fa-IR');
const money = (value: number) => `${number(value)} تومان`;
const ws = (data: AppData, id: string) => data.workshops.find(w => w.id === id)?.name ?? 'کارگاه نامشخص';
const size = (data: AppData, id: string) => data.sizes.find(s => s.id === id)?.name ?? '—';
function part(data: AppData, s: Snapshot, dispatchLineId: string) {
  const source = s.lines.find(l => l.id === dispatchLineId);
  const componentId = source?.product_component_id;
  const product = source && productForLine(data, source);
  return { code: product?.code ?? '—', product: product?.name ?? '—', component: product?.parts.find(x => x.id === componentId)?.name ?? '—' };
}
const table = (headers: string[], rows: string[][]): PdfBlock => ({ kind: 'table', headers, rows });
const line = (label: string, value: string): PdfBlock => ({ kind: 'line', label, value });
const signatures = (labels: string[]): PdfBlock => ({ kind: 'signatures', labels });

function contentFor(kind: PdfKind, id: string, s: Snapshot, data: AppData, from?: string, to?: string): { title: string; serial: string; content: PdfBlock[] } {
  if (kind === 'dispatch') {
    const d = s.dispatches.find(x => x.id === id); if (!d) throw new Error('حواله یافت نشد.');
    const rows = s.lines.filter(l => l.dispatch_id === d.id).flatMap(l => s.quantities.filter(q => q.dispatch_line_id === l.id).map(q => { const p = part(data, s, l.id); return [p.code, p.product, p.component, size(data, q.size_id), number(q.qty)]; }));
    return { title: 'High Fit — برگهٔ ارسال کالای برش‌خورده', serial: d.serial, content: [line('تاریخ', date(d.dispatch_date)), line('کارگاه مقصد', ws(data, d.workshop_id)), line('مرکز ارسال', d.origin_center), table(['کد محصول', 'محصول', 'جزء', 'سایز', 'تعداد'], rows), line('جمع کل', number(s.quantities.filter(q => s.lines.some(l => l.dispatch_id === d.id && l.id === q.dispatch_line_id)).reduce((n, q) => n + q.qty, 0))), signatures(['ارسال‌کننده', 'دریافت‌کننده'])] };
  }
  if (kind === 'receipt') {
    const r = s.receipts.find(x => x.id === id); if (!r) throw new Error('رسید یافت نشد.');
    const d = s.dispatches.find(x => x.id === r.dispatch_id); const rows = s.receiptLines.filter(l => l.receipt_id === id).map(l => { const p = part(data, s, l.dispatch_line_id); return [p.product, p.component, size(data, l.size_id), number(l.declared_qty), number(l.actual_qty), number(l.actual_qty - l.declared_qty)]; });
    return { title: 'High Fit — رسید دریافت کارگاه', serial: r.serial ?? r.id.slice(0, 8), content: [line('تاریخ', date(r.received_date)), line('حواله', d?.serial ?? '—'), line('کارگاه', ws(data, d?.workshop_id ?? '')), line('وضعیت بررسی', r.status === 'approved' ? 'تأییدشده' : 'در انتظار تأیید مدیر'), table(['محصول', 'جزء', 'سایز', 'اعلامی', 'واقعی', 'مغایرت'], rows), line('جمع واقعی دریافت‌شده', number(s.receiptLines.filter(l => l.receipt_id === id).reduce((n, l) => n + l.actual_qty, 0))), ...(r.review_note ? [line('توضیح مدیر', r.review_note)] : []), signatures(['تحویل‌دهنده', 'گیرنده'])] };
  }
  if (kind === 'delivery') {
    const d = s.deliveries.find(x => x.id === id); if (!d) throw new Error('سند تحویل یافت نشد.');
    const entries = s.deliveryLines.filter(l => l.delivery_id === id);
    const rows = entries.map(l => { const p = part(data, s, l.dispatch_line_id); const wage = s.ledger.find(w => w.source_id === l.id); return [p.product, p.component, size(data, l.size_id), number(l.qty_sewn ?? l.qty_delivered), number(l.qty_delivered), l.qty_accepted === null ? '—' : number(l.qty_accepted), wage ? money(wage.net_amount) : '—']; });
    return { title: 'High Fit — برگهٔ تحویل دوخته‌شده', serial: d.serial ?? d.id.slice(0, 8), content: [line('تاریخ', date(d.delivery_date)), line('حواله', s.dispatches.find(x => x.id === d.dispatch_id)?.serial ?? '—'), line('کارگاه', ws(data, d.workshop_id)), line('وضعیت', d.status === 'approved' ? 'تأییدشده' : 'در انتظار بررسی'), table(['محصول', 'جزء', 'سایز', 'دوخته', 'تحویل', 'تأیید', 'دستمزد'], rows), line('جمع دستمزد قطعی', money(s.ledger.filter(w => entries.some(l => l.id === w.source_id)).reduce((n, w) => n + w.net_amount, 0))), signatures(['کارگاه', 'مرکز'])] };
  }
  if (kind === 'payment') {
    const p = s.payments.find(x => x.id === id); if (!p) throw new Error('پرداخت یافت نشد.');
    const rows = s.allocations.filter(a => a.payment_id === id).map(a => { const w = s.ledger.find(l => l.id === a.wage_ledger_id); const d = s.deliveryLines.find(l => l.id === w?.source_id); const info = part(data, s, d?.dispatch_line_id ?? ''); return [info.product, info.component, size(data, w?.size_id ?? ''), date(w?.created_at ?? ''), money(a.allocated_amount)]; });
    return { title: 'High Fit — رسید پرداخت', serial: p.serial ?? p.id.slice(0, 8), content: [line('تاریخ', date(p.payment_date)), line('کارگاه', ws(data, p.workshop_id)), line('روش پرداخت', ({ cash: 'نقد', card: 'کارت', transfer: 'انتقال', other: 'سایر' } as const)[p.method]), line('شماره پیگیری', p.reference || '—'), line('مبلغ پرداخت', money(p.amount)), table(['محصول', 'جزء', 'سایز', 'تاریخ دستمزد', 'مبلغ تخصیص'], rows), signatures(['پرداخت‌کننده', 'دریافت‌کننده'])] };
  }
  const entries = s.ledger.filter(l => (!id || l.workshop_id === id) && (!from || l.created_at.slice(0, 10) >= from) && (!to || l.created_at.slice(0, 10) <= to));
  const rows = entries.map(l => { const d = s.deliveryLines.find(x => x.id === l.source_id); const p = part(data, s, d?.dispatch_line_id ?? ''); return [date(l.created_at), p.product, p.component, size(data, l.size_id), number(l.qty_base), money(l.rate_amount_snapshot), money(l.net_amount)]; });
  const total = entries.reduce((n, l) => n + l.net_amount, 0), paid = entries.reduce((n, l) => n + paidFor(s, l.id), 0);
  return { title: 'High Fit — دفتر دستمزد کارگاه', serial: id ? ws(data, id) : 'همهٔ کارگاه‌ها', content: [line('بازه', `${date(from ?? '')} تا ${date(to ?? '')}`), table(['تاریخ', 'محصول', 'جزء', 'سایز', 'تعداد', 'نرخ', 'خالص'], rows), line('جمع دستمزد', money(total)), line('تخصیص پرداخت', money(paid)), line('مانده', money(total - paid)), signatures(['مسئول کارگاه', 'مدیر'])] };
}

function addText(parent: HTMLElement, tag: string, text: string, css: Partial<CSSStyleDeclaration> = {}) {
  const node = document.createElement(tag);
  node.textContent = text;
  Object.assign(node.style, css);
  parent.appendChild(node);
  return node;
}

export async function downloadDocumentPdf(kind: PdfKind, id: string, snapshot: Snapshot, data: AppData, from?: string, to?: string): Promise<void> {
  const { title, serial, content } = contentFor(kind, id, snapshot, data, from, to);
  let page: HTMLDivElement | undefined;
  let fontStyle: HTMLStyleElement | undefined;
  try {
    const response = await fetch('/fonts/vazirmatn-var.woff2');
    if (!response.ok) throw new Error(`فونت فارسی بارگیری نشد (خطای ${response.status}).`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) throw new Error('فایل فونت فارسی خالی است.');
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    fontStyle = document.createElement('style');
    fontStyle.textContent = `@font-face{font-family:HighFitPdfVazirmatn;src:url(data:font/woff2;base64,${btoa(binary)}) format('woff2');font-weight:100 900;font-style:normal}`;
    document.head.appendChild(fontStyle);
    await document.fonts.load('16px HighFitPdfVazirmatn');
    if (!document.fonts.check('16px HighFitPdfVazirmatn')) throw new Error('فونت فارسی برای ساخت PDF آماده نشد.');

    page = document.createElement('div');
    page.dir = 'rtl';
    page.setAttribute('aria-hidden', 'true');
    Object.assign(page.style, { position: 'fixed', left: '-10000px', top: '0', zIndex: '-1', width: '794px', boxSizing: 'border-box', padding: '42px 48px', backgroundColor: '#ffffff', color: '#202633', fontFamily: 'HighFitPdfVazirmatn, sans-serif', fontSize: '15px', lineHeight: '1.85', textAlign: 'right', overflowWrap: 'anywhere' } as Partial<CSSStyleDeclaration>);
    addText(page, 'h1', title, { fontSize: '24px', fontWeight: '800', color: '#1d2d69', margin: '0 0 12px' });
    addText(page, 'p', `شماره سند: ${serial}`, { margin: '0 0 16px', fontWeight: '700' });
    for (const block of content) {
      if (block.kind === 'line') {
        addText(page, 'p', `${block.label}: ${block.value}`, { margin: '4px 0' });
      } else if (block.kind === 'signatures') {
        const row = document.createElement('div');
        Object.assign(row.style, { display: 'flex', gap: '24px', marginTop: '42px' });
        for (const label of block.labels) addText(row, 'div', `امضا و نام ${label}:\n\n................................`, { flex: '1', whiteSpace: 'pre-line', textAlign: 'center' });
        page.appendChild(row);
      } else {
        const wrapper = document.createElement('div');
        Object.assign(wrapper.style, { width: '100%', overflow: 'hidden', margin: '18px 0' });
        const grid = document.createElement('table');
        Object.assign(grid.style, { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '13px' });
        const rows = [block.headers, ...(block.rows.length ? block.rows : [block.headers.map((_, i) => i === 0 ? 'موردی ثبت نشده است' : '')])];
        for (const [index, values] of rows.entries()) {
          const tr = document.createElement('tr');
          for (const value of values) {
            const cell = document.createElement(index === 0 ? 'th' : 'td');
            cell.textContent = value;
            Object.assign(cell.style, { border: '1px solid #cbd5e1', padding: '7px 5px', textAlign: 'right', verticalAlign: 'top', backgroundColor: index === 0 ? '#e9ecf6' : '#ffffff', overflowWrap: 'anywhere' });
            tr.appendChild(cell);
          }
          grid.appendChild(tr);
        }
        wrapper.appendChild(grid);
        page.appendChild(wrapper);
      }
    }
    page.setAttribute('data-high-fit-pdf', '');
    document.body.appendChild(page);
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
    const canvas = await html2canvas(page, { backgroundColor: '#ffffff', scale: 1.5, logging: false, useCORS: false, onclone: cloned => {
      const target = cloned.querySelector('[data-high-fit-pdf]') as HTMLElement | null;
      if (target) { target.style.position = 'absolute'; target.style.left = '0'; target.style.top = '0'; target.style.zIndex = '1'; }
    } });
    if (!canvas.width || !canvas.height) throw new Error('صفحهٔ PDF ساخته نشد.');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const margin = 14;
    const availableWidth = pdf.internal.pageSize.getWidth() - margin * 2;
    const availableHeight = pdf.internal.pageSize.getHeight() - margin * 2;
    const sliceHeight = Math.floor(canvas.width * availableHeight / availableWidth);
    for (let start = 0, index = 0; start < canvas.height; start += sliceHeight, index++) {
      const height = Math.min(sliceHeight, canvas.height - start);
      const slice = document.createElement('canvas');
      slice.width = canvas.width; slice.height = height;
      const context = slice.getContext('2d');
      if (!context) throw new Error('ساخت صفحهٔ PDF در این دستگاه ممکن نشد.');
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, slice.width, slice.height);
      context.drawImage(canvas, 0, start, canvas.width, height, 0, 0, canvas.width, height);
      if (index > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/jpeg', 0.9), 'JPEG', margin, margin, availableWidth, height * availableWidth / canvas.width, undefined, 'FAST');
    }
    const blob = pdf.output('blob');
    if (blob.size < 500) throw new Error('ساخت فایل PDF کامل نشد.');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `high-fit-${kind}-${serial.replace(/[^a-zA-Z0-9-]/g, '-')}.pdf`;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    console.error('High Fit PDF generation failed:', error);
    throw error;
  } finally {
    page?.remove();
    fontStyle?.remove();
  }
}
