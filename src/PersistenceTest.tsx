import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Plus, RotateCcw } from 'lucide-react';
import { openData } from './data';

const key = 'persistence-test-counter';

type CounterRow = { id: string; value: number };

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('ذخیره‌سازی ناموفق بود.'));
    tx.onabort = () => reject(tx.error ?? new Error('ذخیره‌سازی لغو شد.'));
  });
}

async function readCounter(): Promise<number> {
  const db = await openData();
  try {
    const tx = db.transaction('settings', 'readonly');
    const finished = transactionDone(tx);
    const row = await new Promise<CounterRow | undefined>((resolve, reject) => {
      const request = tx.objectStore('settings').get(key);
      request.onsuccess = () => resolve(request.result as CounterRow | undefined);
      request.onerror = () => reject(request.error);
    });
    await finished;
    if (row === undefined) return 0;
    if (!Number.isSafeInteger(row.value) || row.value < 0) throw new Error('مقدار ذخیره‌شده معتبر نیست.');
    return row.value;
  } finally {
    db.close();
  }
}

async function incrementCounter(): Promise<number> {
  const db = await openData();
  try {
    const tx = db.transaction('settings', 'readwrite');
    const finished = transactionDone(tx);
    const store = tx.objectStore('settings');
    const row = await new Promise<CounterRow | undefined>((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result as CounterRow | undefined);
      request.onerror = () => reject(request.error);
    });
    const current = row?.value ?? 0;
    if (!Number.isSafeInteger(current) || current < 0 || current === Number.MAX_SAFE_INTEGER) {
      tx.abort();
      await finished.catch(() => {});
      throw new Error('مقدار شمارنده معتبر نیست یا به حد مجاز رسیده است.');
    }
    store.put({ id: key, value: current + 1 });
    await finished;
    return current + 1;
  } finally {
    db.close();
  }
}

export default function PersistenceTest() {
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  async function reload() {
    setError('');
    setCount(null);
    try { setCount(await readCounter()); }
    catch (e) { setError(e instanceof Error ? e.message : 'خواندن داده ممکن نشد.'); }
  }
  useEffect(() => { void reload(); }, []);

  async function add() {
    if (savingRef.current || count === null) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try { setCount(await incrementCounter()); }
    catch (e) { setError(e instanceof Error ? e.message : 'ذخیرهٔ شمارنده ممکن نشد.'); }
    finally { savingRef.current = false; setSaving(false); }
  }

  return <div className="min-h-screen bg-[#f6f7f8] px-4 py-8 text-slate-800 dark:bg-slate-950 dark:text-slate-100" style={{ paddingTop: 'max(32px, env(safe-area-inset-top))' }}>
    <main className="mx-auto w-full max-w-lg">
      <a href="/" data-testid="persistence-back" className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 hover:bg-slate-200 focus-visible:outline-2 dark:hover:bg-slate-800"><ArrowRight size={18}/> بازگشت به برنامه</a>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-8">
        <h1 data-testid="persistence-title" className="text-2xl font-extrabold">آزمون ماندگاری داده در APK</h1>
        <p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300">این عدد را چند بار افزایش بده، برنامه را کاملاً ببند، دوباره باز کن. اگر عدد باقی ماند، یعنی ذخیره‌سازی در APK پایدار است.</p>
        <p className="mt-3 text-sm leading-7 text-slate-500 dark:text-slate-400">این شمارنده در IndexedDB همین برنامه ذخیره می‌شود؛ این آزمون، SQLite نیست.</p>
        <div data-testid="persistence-count" aria-live="polite" className="my-8 rounded-2xl bg-slate-100 py-8 text-center text-5xl font-extrabold tabular-nums dark:bg-slate-800">{count === null ? 'در حال خواندن…' : count.toLocaleString('fa-IR')}</div>
        {error && <div data-testid="persistence-error" role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</div>}
        <div className="flex flex-wrap gap-3">
          <button data-testid="persistence-increment" type="button" onClick={add} disabled={count === null || saving} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-800 px-6 font-bold text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"><Plus size={22}/> +</button>
          <button data-testid="persistence-reload" type="button" onClick={() => void reload()} disabled={saving} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 hover:bg-slate-100 focus-visible:outline-2 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"><RotateCcw size={18}/> خواندن دوباره</button>
        </div>
      </section>
    </main>
  </div>;
}
