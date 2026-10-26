import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

type SizeOption = { id: string; name: string; max?: number; disabled?: boolean };
type Entry = { key: string; sizeId: string };
const input = 'mt-1 min-h-11 w-full rounded-xl border border-[#cbd5df] bg-white px-3 py-2 text-[#172B45] focus-visible:outline-2 focus-visible:outline-[#E99A35] dark:border-slate-600 dark:bg-[#24364b] dark:text-white';
const initialEntries = (values: Record<string, number>, options: SizeOption[]): Entry[] => Object.keys(values).filter(id => values[id] > 0 && options.some(o => o.id === id)).map(id => ({ key: id, sizeId: id }));

/** One size/quantity pair at a time; only selected sizes are written to the parent. */
export default function SizeQuantityEditor({ options, values, onChange, testId, addLabel = 'افزودن سایز' }: { options: SizeOption[]; values: Record<string, number>; onChange: (next: Record<string, number>) => void; testId: string; addLabel?: string }) {
  const [entries, setEntries] = useState<Entry[]>(() => initialEntries(values, options));
  const [serial, setSerial] = useState(0);
  const updateSize = (entry: Entry, sizeId: string) => {
    const next = { ...values };
    if (entry.sizeId) delete next[entry.sizeId];
    if (sizeId) next[sizeId] = 0;
    setEntries(rows => rows.map(row => row.key === entry.key ? { ...row, sizeId } : row));
    onChange(next);
  };
  const remove = (entry: Entry) => {
    const next = { ...values }; if (entry.sizeId) delete next[entry.sizeId];
    setEntries(rows => rows.filter(row => row.key !== entry.key)); onChange(next);
  };
  return <div data-testid={testId} className="mt-3 space-y-3">
    {entries.map((entry, index) => {
      const selected = options.find(o => o.id === entry.sizeId);
      return <div key={entry.key} className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <label className="block min-w-0 text-sm">سایز
          <select data-testid={`${testId}-size-${index}`} className={input} value={entry.sizeId} onChange={e => updateSize(entry, e.target.value)}>
            <option value="">انتخاب سایز</option>
            {options.map(o => <option key={o.id} value={o.id} disabled={o.id !== entry.sizeId && (o.disabled || entries.some(row => row.sizeId === o.id))}>{o.name}</option>)}
          </select>
        </label>
        <label className="block min-w-0 text-sm">تعداد{selected?.max !== undefined ? ` · حداکثر ${selected.max.toLocaleString('fa-IR')}` : ''}
          <input data-testid={`${testId}-qty-${index}`} className={input} type="number" inputMode="numeric" min="0" max={selected?.max} step="1" disabled={!entry.sizeId} value={entry.sizeId ? (values[entry.sizeId] || '') : ''} onChange={e => { if (!entry.sizeId) return; onChange({ ...values, [entry.sizeId]: e.target.value === '' ? 0 : Number(e.target.value) }); }}/>
        </label>
        <button data-testid={`${testId}-remove-${index}`} type="button" aria-label={`حذف ردیف سایز ${index + 1}`} onClick={() => remove(entry)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 hover:bg-slate-100 focus-visible:outline-2 dark:border-slate-600 dark:hover:bg-slate-800"><Trash2 size={17}/> حذف</button>
      </div>;
    })}
    {entries.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">هنوز سایزی وارد نشده است.</p>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button data-testid={`${testId}-add`} type="button" disabled={entries.length >= options.filter(o => !o.disabled).length || options.every(o => o.disabled)} onClick={() => { const next = serial + 1; setSerial(next); setEntries(rows => [...rows, { key: `new-${next}`, sizeId: '' }]); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 hover:bg-slate-100 focus-visible:outline-2 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"><Plus size={17}/>{addLabel}</button>
      <strong data-testid={`${testId}-total`} className="text-sm">جمع: {Object.values(values).reduce((sum, n) => sum + (Number.isFinite(n) && n > 0 ? n : 0), 0).toLocaleString('fa-IR')}</strong>
    </div>
  </div>;
}
