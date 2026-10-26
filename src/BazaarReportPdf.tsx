import { useRef, useState } from 'react';
import { Download, FileText } from 'lucide-react';

const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-800 px-5 font-bold text-white transition hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900';

export default function BazaarReportPdf() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const captureRef = useRef<HTMLDivElement>(null);
  const lock = useRef(false);

  async function downloadPdf() {
    if (lock.current || !text.trim()) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      if (!captureRef.current) throw new Error('پیش‌نمایش گزارش آماده نیست.');
      await document.fonts.ready;
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: '#ffffff', scale: 1.5, useCORS: false, logging: false,
        onclone: clonedDocument => {
          const target = clonedDocument.querySelector('[data-testid="bazaar-pdf-content"]') as HTMLElement | null;
          if (target) { target.style.position = 'absolute'; target.style.left = '0'; target.style.top = '0'; target.style.zIndex = '1'; }
        },
      });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const margin = 14;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const printableWidth = pageWidth - margin * 2;
      const printableHeight = pageHeight - margin * 2;
      const sliceHeight = Math.floor(canvas.width * printableHeight / printableWidth);
      for (let start = 0, index = 0; start < canvas.height; start += sliceHeight, index++) {
        const height = Math.min(sliceHeight, canvas.height - start);
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = height;
        const context = slice.getContext('2d');
        if (!context) throw new Error('ساخت تصویر گزارش در این دستگاه ممکن نشد.');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, slice.width, slice.height);
        context.drawImage(canvas, 0, start, canvas.width, height, 0, 0, canvas.width, height);
        if (index > 0) pdf.addPage();
        pdf.addImage(slice.toDataURL('image/jpeg', 0.9), 'JPEG', margin, margin, printableWidth, height * printableWidth / canvas.width, undefined, 'FAST');
      }
      const blob = pdf.output('blob');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'bazaar-studio-report.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ساخت PDF انجام نشد. دوباره تلاش کنید.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return <section data-testid="bazaar-report-page" className="space-y-5">
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-3"><FileText size={22}/><h2 className="text-lg font-bold">گزارش بازار استودیو</h2></div>
      <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">متن کامل گزارش را اینجا وارد کنید تا نسخهٔ فارسی PDF آن روی دستگاهتان ذخیره شود. تا زمانی که متن را وارد نکنید، گزارشی ساخته نمی‌شود.</p>
      <label htmlFor="bazaar-report-text" className="mt-5 block font-medium">متن گزارش</label>
      <textarea id="bazaar-report-text" data-testid="bazaar-report-text" value={text} onChange={e => setText(e.target.value)} rows={12} maxLength={25000} placeholder="متن کامل گزارش بازار استودیو را اینجا جای‌گذاری کنید…" className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-4 text-sm leading-8 text-slate-900 outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:ring-slate-700"/>
      <p className="mt-2 text-sm text-slate-500">متن این صفحه فقط برای ساخت فایل استفاده می‌شود و ذخیره نمی‌شود.</p>
      {error && <p data-testid="bazaar-report-error" role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
      <button data-testid="bazaar-report-download" type="button" disabled={busy || !text.trim()} onClick={() => void downloadPdf()} className={button + ' mt-5'}><Download size={18}/>{busy ? 'در حال آماده‌سازی PDF…' : 'دانلود PDF گزارش'}</button>
    </div>
    <div ref={captureRef} data-testid="bazaar-pdf-content" aria-hidden="true" style={{ position: 'fixed', left: '-10000px', top: 0, width: 794, padding: '20px 0', background: '#ffffff', color: '#263238', fontFamily: 'Vazirmatn, sans-serif', direction: 'rtl', textAlign: 'right', zIndex: -1 }}>
      <h1 style={{ fontSize: 27, fontWeight: 800, margin: '0 0 24px', lineHeight: 1.8 }}>گزارش بازار استودیو</h1>
      <div style={{ fontSize: 17, lineHeight: '2.1', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{text}</div>
    </div>
  </section>;
}
