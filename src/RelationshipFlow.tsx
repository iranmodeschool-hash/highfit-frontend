import { useState } from 'react';
import { ArrowDown, Factory, Boxes, Layers3 } from 'lucide-react';
import { productForLine, type AppData } from './data';
import type { Snapshot } from './operations';
import CodeText from './CodeText';

export default function RelationshipFlow({ data, snapshot }: { data: AppData; snapshot: Snapshot | null }) {
  const [productId, setProductId] = useState('');
  const [componentId, setComponentId] = useState('');
  const products = data.products;
  const components = data.components;
  const visibleProducts = componentId ? products.filter(p => p.parts.some(part => (part.componentId ?? part.id) === componentId)) : products;
  const visibleComponents = productId ? components.filter(c => products.find(p => p.id === productId)?.parts.some(part => (part.componentId ?? part.id) === c.id)) : components;
  const visibleWorkshops = snapshot ? data.workshops.filter(w => (data.role?.kind === 'manager' || data.role?.kind === 'supervisor' || w.id === data.role?.workshopId) && snapshot.dispatches.some(d => d.workshop_id === w.id && snapshot.lines.some(line => {
    if (line.dispatch_id !== d.id) return false;
    const product = productForLine(data, line);
    if (productId && product?.id !== productId) return false;
    const part = product?.parts.find(p => p.id === line.product_component_id);
    return !componentId || (part?.componentId ?? part?.id) === componentId;
  }))) : [];
  const selectProduct = (id: string) => { setProductId(current => current === id ? '' : id); setComponentId(''); };
  const selectComponent = (id: string) => { setComponentId(current => current === id ? '' : id); setProductId(''); };
  const chip = 'min-h-11 w-full min-w-0 rounded-xl border px-3 py-2 text-right transition hover:border-[#E99A35] focus-visible:outline-2 focus-visible:outline-[#E99A35]';
  return <section data-testid="relationship-flow" className="rounded-2xl border border-[#dfe5eb] bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-[#1b293b] sm:p-5">
    <h2 className="text-lg font-bold">نقشهٔ ارتباط تولید</h2>
    <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">محصول یا جزء را انتخاب کنید؛ کارگاه‌ها فقط از حواله‌های ثبت‌شده نمایش داده می‌شوند.</p>
    {(productId || componentId) && <button data-testid="flow-clear" type="button" onClick={() => { setProductId(''); setComponentId(''); }} className="mt-2 min-h-11 text-sm font-bold text-[#172B45] underline dark:text-[#E99A35]">نمایش همه</button>}
    <div className="mt-4 grid grid-cols-1 items-start gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
      <div className="min-w-0 rounded-xl bg-[#F3F5F7] p-3 dark:bg-[#24364b]"><h3 className="mb-3 flex items-center gap-2 font-bold"><Boxes size={18}/> محصولات</h3><div className="max-h-64 space-y-2 overflow-y-auto">{visibleProducts.map(p => <button key={p.id} type="button" data-testid={`flow-product-${p.id}`} aria-pressed={productId === p.id} onClick={() => selectProduct(p.id)} className={`${chip} ${productId === p.id ? 'border-[#E99A35] bg-amber-50 dark:bg-slate-700' : 'border-slate-200 bg-white dark:border-slate-600 dark:bg-[#1b293b]'}`}><CodeText value={p.code}/><span className="block text-sm">{p.name}</span></button>)}{!visibleProducts.length && <p className="text-sm text-slate-500">محصول مرتبطی ثبت نشده است.</p>}</div></div>
      <ArrowDown className="mx-auto text-[#E99A35] md:-rotate-90" size={22}/>
      <div className="min-w-0 rounded-xl bg-[#F3F5F7] p-3 dark:bg-[#24364b]"><h3 className="mb-3 flex items-center gap-2 font-bold"><Layers3 size={18}/> اجزا</h3><div className="max-h-64 space-y-2 overflow-y-auto">{visibleComponents.map(c => <button key={c.id} type="button" data-testid={`flow-component-${c.id}`} aria-pressed={componentId === c.id} onClick={() => selectComponent(c.id)} className={`${chip} ${componentId === c.id ? 'border-[#E99A35] bg-amber-50 dark:bg-slate-700' : 'border-slate-200 bg-white dark:border-slate-600 dark:bg-[#1b293b]'}`}><CodeText value={c.code}/><span className="block text-sm">{c.name}</span></button>)}{!visibleComponents.length && <p className="text-sm text-slate-500">جزء مرتبطی ثبت نشده است.</p>}</div></div>
      <ArrowDown className="mx-auto text-[#E99A35] md:-rotate-90" size={22}/>
      <div className="min-w-0 rounded-xl bg-[#F3F5F7] p-3 dark:bg-[#24364b]"><h3 className="mb-3 flex items-center gap-2 font-bold"><Factory size={18}/> کارگاه‌های دارای حواله</h3><div className="max-h-64 space-y-2 overflow-y-auto">{snapshot ? visibleWorkshops.map(w => <div key={w.id} data-testid={`flow-workshop-${w.id}`} className="rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-600 dark:bg-[#1b293b]">{w.name}</div>) : <p className="text-sm text-slate-500">در حال خواندن حواله‌ها…</p>}{snapshot && !visibleWorkshops.length && <p className="text-sm text-slate-500">حواله‌ای برای این ارتباط ثبت نشده است.</p>}</div></div>
    </div>
  </section>;
}
