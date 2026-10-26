export type Workshop = { id: string; name: string; active: boolean; createdAt: string; updatedAt: string };
export type Part = { id: string; code: string; name: string; unit: string; active: boolean; componentId?: string; consumptionQty?: number | null };
export type Component = { id: string; code: string; name: string; unit: string; active: boolean };
export const componentFor = (data: AppData, part: Part) => data.components.find(c => c.id === part.componentId) ?? data.components.find(c => c.code.toLocaleLowerCase() === part.code.toLocaleLowerCase());
export const productForLine = (data: AppData, line: { product_id?: string; product_component_id: string }) => data.products.find(p => p.id === line.product_id && p.parts.some(x => x.id === line.product_component_id)) ?? data.products.find(p => p.parts.some(x => x.id === line.product_component_id));
export const partForLine = (data: AppData, line: { product_id?: string; product_component_id: string }) => productForLine(data, line)?.parts.find(x => x.id === line.product_component_id); 
export type Product = { id: string; code: string; name: string; description: string; active: boolean; parts: Part[]; createdAt: string; updatedAt: string };
export type Size = { id: string; name: string; active: boolean; order: number };
export type Rate = { id: string; workshopId: string; productId: string; partId: string; amountToman: number; updatedAt: string };
export type Role = { kind: 'manager' | 'supervisor' | 'workshop'; workshopId?: string };
// The authenticated account owns the active role; historic device roles are ignored.
let authenticatedRole: Role | null = null;
export function setAuthenticatedRole(role: Role | null): void { authenticatedRole = role; }
export type Audit = { id: string; at: string; action: string; target: string; role: string };
export type AppData = { workshops: Workshop[]; products: Product[]; components: Component[]; sizes: Size[]; rates: Rate[]; audit: Audit[]; role: Role | null };
type Store = 'workshops' | 'products' | 'sizes' | 'rates' | 'audit' | 'settings';
const stores: Store[] = ['workshops', 'products', 'sizes', 'rates', 'audit', 'settings'];
const name = 'high-fit-workshop-offline';
// Future document collections are created now; operational writes will be added in later phases.
const futureStores = ['component_bank','user_roles','size_groups','product_components','workshop_rates','dispatches','dispatch_lines','dispatch_size_qty','workshop_receipts','workshop_receipt_lines','cut_defects','cut_defect_replacements','sewing_deliveries','sewing_delivery_lines','repair_returns','wage_ledger','payments','payment_allocations','adjustments','audit_log','sync_queue','app_settings','backup_meta'] as const;
const sizesA = ['1','2','3','4','5','6','7','8','9','10','L','XL','2XL','3XL','4XL','5XL','6XL'];
const sizesB = ['30','32','34','36','38','40','42','44','46','48','50','52','54','56','58','60'];
const orderedSizeLabels = [...sizesA, ...sizesB];
const sizeLabel = (size: Size & { label?: string }) => size.label || size.name;
const sizeRank = (size: Size & { label?: string }) => orderedSizeLabels.indexOf(sizeLabel(size));
const compareSizes = (a: Size, b: Size) => {
  const left = sizeRank(a); const right = sizeRank(b);
  return (left < 0 ? Number.MAX_SAFE_INTEGER : left) - (right < 0 ? Number.MAX_SAFE_INTEGER : right) || a.order - b.order || a.id.localeCompare(b.id);
};
export const visibleSizes = (sizes: Size[]): Size[] => {
  const labels = new Set<string>();
  return [...sizes].sort(compareSizes).filter(size => {
    const label = sizeLabel(size as Size & { label?: string });
    if (labels.has(label)) return false;
    labels.add(label);
    return true;
  });
};
export const orderedSizeOptions = (sizes: Size[]): Size[] => visibleSizes(sizes).filter(size => sizeRank(size) >= 0);
const sampleTime = '2025-01-01T00:00:00.000Z';
const seedId = (kind: string, code: string) => `seed-${kind}-${code}`;
const uniqueIndexes: Record<string, { name: string; fields: string | string[] }[]> = {
  user_roles: [{ name: 'code', fields: 'code' }], workshops: [{ name: 'code', fields: 'code' }],
  size_groups: [{ name: 'code', fields: 'code' }], sizes: [{ name: 'group_label', fields: ['size_group_id','name'] }],
  products: [{ name: 'code', fields: 'code' }], product_components: [{ name: 'product_code', fields: ['product_id','code'] }],
  workshop_rates: [{ name: 'rate_date', fields: ['workshop_id','product_component_id','effective_from'] }],
  dispatches: [{ name: 'serial', fields: 'serial' }], dispatch_size_qty: [{ name: 'line_size', fields: ['dispatch_line_id','size_id'] }],
  wage_ledger: [{ name: 'source_line', fields: ['source_type','source_id','product_component_id','size_id'] }],
};
export const schemaStores = [...stores, ...futureStores] as const;
type BackupV2 = { format: 'high-fit-offline'; version: 2; exportedAt: string; data: AppData; collections: Record<string, unknown[]> };
type RestorableBackup = { data: AppData; collections?: Record<string, unknown[]> };
const request = <T>(r: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
const done = (tx: IDBTransaction): Promise<void> => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('ثبت اطلاعات انجام نشد')); });
export const makeId = () => crypto.randomUUID();
const stamp = () => new Date().toISOString();

export function openData(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, 3);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const store of schemaStores) {
        const exists = db.objectStoreNames.contains(store);
        const objectStore = exists ? r.transaction!.objectStore(store) : db.createObjectStore(store, { keyPath: store === 'app_settings' ? 'key' : 'id' });
        // Existing collections may contain old-format records; never impose a new unique index on them during migration.
        if (!exists) for (const index of uniqueIndexes[store] ?? []) objectStore.createIndex(index.name, index.fields, { unique: true });
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('پنجرهٔ دیگری از برنامه باز است؛ آن را ببندید و دوباره تلاش کنید.'));
  });
}

async function readFrom(tx: IDBTransaction): Promise<AppData> {
  const [workshops, products, sizes, rates, audit] = await Promise.all(stores.map(s => request(tx.objectStore(s).getAll())));
  const components = await request(tx.objectStore('component_bank').getAll()) as Component[];
  return { workshops: workshops as Workshop[], products: products as Product[], components, sizes: (sizes as Size[]).sort(compareSizes), rates: rates as Rate[], audit: (audit as Audit[]).sort((a, b) => b.at.localeCompare(a.at)), role: authenticatedRole };
}

async function seedOnce(db: IDBDatabase): Promise<void> {
  const tx = db.transaction(['app_settings','user_roles','size_groups','sizes','workshops','products','product_components','settings'], 'readwrite');
  const finished = done(tx);
  const marker = await request(tx.objectStore('app_settings').get('initial_seed_v2'));
  if (!marker) {
    const roles = tx.objectStore('user_roles');
    roles.put({ id: seedId('role','manager'), code: 'manager', title: 'مدیر', is_active: 1 });
    roles.put({ id: seedId('role','workshop'), code: 'workshop', title: 'مسئول کارگاه', is_active: 1 });
    const groups = tx.objectStore('size_groups');
    groups.put({ id: seedId('group','SG-A'), code: 'SG-A', title: 'عددی–حرفی', sort_order: 0, is_active: 1 });
    groups.put({ id: seedId('group','SG-B'), code: 'SG-B', title: 'عددی بزرگ (۳۰ تا ۶۰)', sort_order: 1, is_active: 1 });
    const currentSizes = await request(tx.objectStore('sizes').getAll()) as Size[];
    const sizeStore = tx.objectStore('sizes');
    for (const [group, labels] of [['SG-A', sizesA], ['SG-B', sizesB]] as const) labels.forEach((label, order) => {
      if (!currentSizes.some(s => s.name === label && (s as Size & { size_group_id?: string }).size_group_id === seedId('group',group))) {
        const legacy = group === 'SG-A' ? currentSizes.find(s => s.name === label && !(s as Size & { size_group_id?: string }).size_group_id) : undefined;
        sizeStore.put({ ...(legacy ?? { id: seedId('size',`${group}-${label}`), active: true }), name: label, order: orderedSizeLabels.indexOf(label), size_group_id: seedId('group',group), label, sort_order: orderedSizeLabels.indexOf(label), is_active: legacy?.active === false ? 0 : 1 });
      }
    });
    const ws = await request(tx.objectStore('workshops').getAll()) as Workshop[];
    for (const [code, display] of [['WS-1','کارگاه شماره ۱'],['WS-2','کارگاه شماره ۲']]) {
      if (!ws.some(w => (w as Workshop & { code?: string }).code === code || w.name === display)) tx.objectStore('workshops').put({ id: seedId('workshop',code), code, name: display, phone: null, note: 'داده نمونه آزمایشی', active: true, is_active: 1, createdAt: sampleTime, created_at: sampleTime, updatedAt: sampleTime });
    }
    const products = await request(tx.objectStore('products').getAll()) as Product[];
    // Carry forward previously saved embedded components without rewriting their parent products.
    for (const product of products) for (const [sort_order, part] of product.parts.entries()) tx.objectStore('product_components').put({ ...part, product_id: product.id, size_group_id: null, sort_order, is_active: part.active ? 1 : 0 });
    if (!products.some(p => p.code === '2511')) {
      const parts = [['SHIRT','پیراهن'],['PANTS','شلوار'],['VEST','جلیقه']].map(([code, name]) => ({ id: seedId('part',code), code, name, unit: 'عدد', active: true }));
      tx.objectStore('products').put({ id: seedId('product','2511'), code: '2511', name: 'ست سه‌تکه نمونه', size_group_id: seedId('group','SG-A'), description: 'داده نمونه آزمایشی', active: true, is_active: 1, parts, createdAt: sampleTime, created_at: sampleTime, updatedAt: sampleTime });
      for (const [sort_order, part] of parts.entries()) tx.objectStore('product_components').put({ ...part, product_id: seedId('product','2511'), size_group_id: seedId('group','SG-A'), sort_order, is_active: 1 });
    }
    tx.objectStore('app_settings').put({ key: 'currency_unit', value: 'تومان' });
    tx.objectStore('app_settings').put({ key: 'initial_seed_v2', value: 'done' });
  }
  await finished;
}

// Normalize the order of existing size records without changing IDs or operational references.
// Referenced duplicates remain in storage; the selector de-duplicates their labels.
async function normalizeSizes(db: IDBDatabase): Promise<void> {
  const tx = db.transaction(['sizes', 'app_settings'], 'readwrite');
  const finished = done(tx);
  try {
    const marker = await request(tx.objectStore('app_settings').get('size_order_v4'));
    if (!marker) {
      const store = tx.objectStore('sizes');
      const existing = await request(store.getAll()) as (Size & { label?: string; size_group_id?: string; sort_order?: number })[];
      for (const [index, label] of orderedSizeLabels.entries()) {
        const matches = existing.filter(size => sizeLabel(size) === label);
        if (!matches.length) {
          const group = index < sizesA.length ? 'SG-A' : 'SG-B';
          store.put({ id: seedId('size', `${group}-${label}`), name: label, label, active: true, is_active: 1, order: index, sort_order: index, size_group_id: seedId('group', group) });
        } else {
          for (const size of matches) if (size.order !== index || size.sort_order !== index) store.put({ ...size, order: index, sort_order: index });
        }
      }
      tx.objectStore('app_settings').put({ key: 'size_order_v4', value: 'done' });
    }
    await finished;
  } catch (error) { try { tx.abort(); } catch { /* already completed */ } await finished.catch(() => {}); throw error; }
}

// Reconcile old embedded definitions once, without replacing edited records or re-seeding deleted examples.
async function migrateLegacyOnce(db: IDBDatabase): Promise<void> {
  const tx = db.transaction(['app_settings','settings','workshops','products','product_components','rates','workshop_rates','sizes'], 'readwrite');
  const finished = done(tx);
  const marker = await request(tx.objectStore('app_settings').get('legacy_reconciled_v3'));
  if (!marker) {
    const ws = await request(tx.objectStore('workshops').getAll()) as (Workshop & { code?: string; is_active?: number })[];
    const products = await request(tx.objectStore('products').getAll()) as Product[];
    const sizes = await request(tx.objectStore('sizes').getAll()) as (Size & { size_group_id?: string; label?: string })[];
    const rates = await request(tx.objectStore('rates').getAll()) as Rate[];
    const historical = await request(tx.objectStore('workshop_rates').getAll()) as { workshop_id: string; product_component_id: string }[];
    const components = await request(tx.objectStore('product_components').getAll()) as { id: string }[];
    for (const w of ws) if (!w.code || w.is_active === undefined) tx.objectStore('workshops').put({ ...w, code: w.code ?? `LEGACY-${w.id}`, is_active: w.active ? 1 : 0, created_at: w.createdAt });
    for (const p of products) {
      for (const [sort_order, part] of p.parts.entries()) if (!components.some(c => c.id === part.id)) tx.objectStore('product_components').put({ ...part, product_id: p.id, size_group_id: null, sort_order, is_active: part.active ? 1 : 0 });
    }
    for (const s of sizes) if (!s.size_group_id || !s.label) tx.objectStore('sizes').put({ ...s, size_group_id: s.size_group_id ?? seedId('group','SG-A'), label: s.name, sort_order: s.order, is_active: s.active ? 1 : 0 });
    for (const r of rates) if (!historical.some(h => h.workshop_id === r.workshopId && h.product_component_id === r.partId)) {
      const at = r.updatedAt || stamp();
      tx.objectStore('workshop_rates').put({ id: `legacy-rate-${r.id}`, workshop_id: r.workshopId, product_component_id: r.partId, amount_toman: r.amountToman, effective_from: at, effective_to: null, created_by_role: 'manager', created_at: at });
    }
    tx.objectStore('app_settings').put({ key: 'legacy_reconciled_v3', value: 'done' });
  }
  await finished;
}

// Add catalog identities without rewriting historical relationship IDs or documents.
async function reconcileComponents(db: IDBDatabase): Promise<void> {
  const tx = db.transaction(['app_settings', 'products', 'component_bank', 'product_components'], 'readwrite');
  const finished = done(tx);
  try {
    if (!await request(tx.objectStore('app_settings').get('component_bank_v1'))) {
      const products = await request(tx.objectStore('products').getAll()) as Product[];
      const links = await request(tx.objectStore('product_components').getAll()) as (Part & { product_id: string; component_id?: string })[];
      const bank = new Map<string, Component>();
      for (const p of products) for (const part of p.parts ?? []) {
        const key = clean(part.code);
        let component = bank.get(key);
        if (!component) { component = { id: part.id, code: part.code, name: part.name, unit: part.unit, active: part.active }; bank.set(key, component); tx.objectStore('component_bank').put(component); }
        const previous = links.find(x => x.id === part.id);
        tx.objectStore('product_components').put({ ...(previous ?? part), product_id: p.id, component_id: component.id, consumption_qty: part.consumptionQty ?? null, sort_order: p.parts.indexOf(part), is_active: part.active ? 1 : 0 });
        if (part.componentId !== component.id) part.componentId = component.id;
      }
      for (const p of products) tx.objectStore('products').put(p);
      tx.objectStore('app_settings').put({ key: 'component_bank_v1', value: 'done' });
    }
    await finished;
  } catch (error) { try { tx.abort(); } catch { /* already completed */ } await finished.catch(() => {}); throw error; }
}

export async function loadData(): Promise<AppData> {
  const db = await openData();
  try {
    await seedOnce(db);
    await migrateLegacyOnce(db);
    await normalizeSizes(db);
    await reconcileComponents(db);
    const tx = db.transaction([...stores, 'component_bank'], 'readonly');
    const finished = done(tx);
    const result = await readFrom(tx);
    await finished;
    return result;
  } finally { db.close(); }
}

export type Change =
  | { type: 'workshop'; value: Workshop }
  | { type: 'product'; value: Product }
  | { type: 'component'; value: Component }
  | { type: 'size'; value: Size }
  | { type: 'rate'; value: Rate };
const clean = (s: string) => s.trim().toLocaleLowerCase();
const assert: (ok: unknown, msg: string) => asserts ok = (ok, msg) => { if (!ok) throw new Error(msg); };
const validText = (s: unknown, max = 100) => typeof s === 'string' && !!s.trim() && s.trim().length <= max;

export async function saveChange(change: Change): Promise<void> {
  const db = await openData();
  try {
    const tx = db.transaction([...stores, 'app_settings','component_bank','product_components','workshop_rates','sync_queue'], 'readwrite');
    const finished = done(tx);
    try {
      const data = await readFrom(tx);
      const now = stamp();
      let target = '';
      {
        assert(data.role?.kind === 'manager', 'این عملیات فقط برای مدیر مجاز است.');
        if (change.type === 'workshop') {
          const w = change.value;
          assert(validText(w.name), 'نام کارگاه باید بین ۱ تا ۱۰۰ نویسه باشد.');
          assert(!data.workshops.some(x => x.id !== w.id && clean(x.name) === clean(w.name)), 'نام کارگاه تکراری است.');
          tx.objectStore('workshops').put({ ...w, code: (w as Workshop & { code?: string }).code || `WS-${w.id}`, is_active: w.active ? 1 : 0, created_at: w.createdAt, name: w.name.trim(), updatedAt: now }); target = w.name;
        }
        if (change.type === 'product') {
          const p = change.value;
          assert(validText(p.code, Infinity) && validText(p.name), 'کد و نام محصول الزامی است.');
          assert(p.parts.length >= 1, 'هر محصول باید دست‌کم یک جزء داشته باشد.');
          assert(!data.products.some(x => x.id !== p.id && clean(x.code) === clean(p.code)), 'کد محصول تکراری است.');
          const codes = p.parts.map(x => clean(x.code));
          assert(p.parts.every(x => validText(x.code, Infinity) && validText(x.name) && validText(x.unit, 30) && (x.consumptionQty == null || (Number.isFinite(x.consumptionQty) && x.consumptionQty > 0))), 'کد، نام، واحد یا مقدار مصرف اجزا معتبر نیست.');
          assert(new Set(codes).size === codes.length, 'کد اجزا در یک محصول باید یکتا باشد.');
          const old = data.products.find(x => x.id === p.id);
          if (old) assert(old.parts.every(x => p.parts.some(y => y.id === x.id)), 'برای حفظ سوابق، جزء ثبت‌شده را حذف نکنید؛ آن را غیرفعال کنید.');
          const linkedParts = p.parts.map(part => {
            const catalog = data.components.find(c => c.id === part.componentId) ?? data.components.find(c => clean(c.code) === clean(part.code));
            if (catalog) {
              assert(clean(catalog.code) === clean(part.code) && catalog.name === part.name && catalog.unit === part.unit, 'مشخصات جزء مشترک را در بانک اجزا ویرایش کنید.');
              return { ...part, componentId: catalog.id, code: catalog.code, name: catalog.name, unit: catalog.unit };
            }
            assert(!data.components.some(c => c.id === part.id), 'برای استفادهٔ مجدد از جزء، آن را از بانک اجزا انتخاب کنید.');
            const component = { id: part.id, code: part.code, name: part.name, unit: part.unit, active: part.active };
            tx.objectStore('component_bank').put(component);
            return { ...part, componentId: component.id };
          });
          assert(new Set(linkedParts.map(x => x.componentId)).size === linkedParts.length, 'یک جزء نمی‌تواند دو بار به یک محصول متصل شود.');
          tx.objectStore('products').put({ ...p, code: p.code, name: p.name.trim(), description: p.description.trim(), is_active: p.active ? 1 : 0, created_at: p.createdAt, parts: linkedParts, updatedAt: now });
          linkedParts.forEach((part, sort_order) => tx.objectStore('product_components').put({ ...part, product_id: p.id, component_id: part.componentId, consumption_qty: part.consumptionQty ?? null, size_group_id: null, sort_order, is_active: part.active ? 1 : 0 })); target = p.code;
        }
        if (change.type === 'component') {
          const c = change.value;
          assert(validText(c.code, Infinity) && validText(c.name) && validText(c.unit, 30), 'کد، نام و واحد جزء الزامی است.');
          assert(!data.components.some(x => x.id !== c.id && clean(x.code) === clean(c.code)), 'کد جزء در بانک اجزا تکراری است.');
          const updated = { ...c, name: c.name.trim(), unit: c.unit.trim() };
          const existingLinks = await request(tx.objectStore('product_components').getAll()) as (Part & { product_id: string; component_id?: string; sort_order?: number })[];
          tx.objectStore('component_bank').put(updated);
          for (const p of data.products) {
            if (!p.parts.some(part => part.componentId === c.id)) continue;
            const parts = p.parts.map(part => part.componentId === c.id ? { ...part, code: c.code, name: updated.name, unit: updated.unit, active: c.active } : part);
            tx.objectStore('products').put({ ...p, parts });
            parts.filter(part => part.componentId === c.id).forEach(part => tx.objectStore('product_components').put({ ...existingLinks.find(link => link.id === part.id), ...part, product_id: p.id, component_id: c.id, consumption_qty: part.consumptionQty ?? null, is_active: c.active ? 1 : 0 }));
          }
          target = c.code;
        }
        if (change.type === 'size') {
          const s = change.value;
          assert(validText(s.name, 20), 'نام سایز الزامی است.');
          assert(!data.sizes.some(x => x.id !== s.id && clean(x.name) === clean(s.name)), 'سایز تکراری است.');
          tx.objectStore('sizes').put({ ...s, name: s.name.trim() }); target = s.name;
        }
        if (change.type === 'rate') {
          const r = change.value;
          const product = data.products.find(p => p.id === r.productId);
          assert(data.workshops.some(w => w.id === r.workshopId) && product?.parts.some(p => p.id === r.partId), 'ارجاع نرخ به کارگاه یا جزء معتبر نیست.');
          assert(Number.isSafeInteger(r.amountToman) && r.amountToman >= 0, 'نرخ باید عدد صحیح نامنفی به تومان باشد.');
          assert(r.id === `${r.workshopId}:${r.partId}`, 'شناسهٔ نرخ معتبر نیست.');
          tx.objectStore('rates').put({ ...r, updatedAt: now });
          tx.objectStore('workshop_rates').put({ id: makeId(), workshop_id: r.workshopId, product_component_id: r.partId, amount_toman: r.amountToman, effective_from: now, effective_to: null, created_by_role: 'manager', created_at: now }); target = `${product?.code} / ${r.partId}`;
        }
      }
      tx.objectStore('audit').put({ id: makeId(), at: now, action: change.type, target, role: data.role?.kind ?? 'انتخاب اولیه' });
      tx.objectStore('sync_queue').put({ id: makeId(), doc_type: change.type, doc_id: change.value.id, status: 'pending', created_at: now, synced_at: null });
      await finished;
    } catch (error) { try { tx.abort(); } catch { /* transaction may already have ended */ } await finished.catch(() => {}); throw error; }
  } finally { db.close(); }
}

export async function getThemeSetting(): Promise<'system' | 'light' | 'dark'> {
  const db = await openData();
  try { const tx = db.transaction('app_settings','readonly'); const finished = done(tx); const row = await request(tx.objectStore('app_settings').get('theme')) as { value?: string } | undefined; await finished; return row?.value === 'dark' ? 'dark' : row?.value === 'light' ? 'light' : 'system'; }
  finally { db.close(); }
}
export async function setThemeSetting(value: 'system' | 'light' | 'dark'): Promise<void> {
  const db = await openData();
  try { const tx = db.transaction('app_settings','readwrite'); const finished = done(tx); tx.objectStore('app_settings').put({ key: 'theme', value }); await finished; }
  finally { db.close(); }
}

export async function createBackup(): Promise<string> {
  // Ensure first-run seed and legacy reconciliation have completed before taking a snapshot.
  await loadData();
  const db = await openData();
  try {
    const tx = db.transaction(schemaStores, 'readonly');
    const finished = done(tx);
    const collections: Record<string, unknown[]> = {};
    for (const store of schemaStores) collections[store] = await request(tx.objectStore(store).getAll());
    await finished;
    const data: AppData = {
      workshops: collections.workshops as Workshop[], products: collections.products as Product[], components: collections.component_bank as Component[],
      sizes: collections.sizes as Size[], rates: collections.rates as Rate[], audit: collections.audit as Audit[],
      role: null, // Do not export device-selected mock roles as account permissions.
    };
    const backup: BackupV2 = { format: 'high-fit-offline', version: 2, exportedAt: stamp(), data, collections };
    return JSON.stringify(backup, null, 2);
  } finally { db.close(); }
}

export function validateBackup(text: string): RestorableBackup {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('فایل پشتیبان JSON معتبر نیست.'); }
  const backup = parsed as { format?: string; version?: number; data?: AppData; collections?: Record<string, unknown[]> };
  assert(backup?.format === 'high-fit-offline' && (backup.version === 1 || backup.version === 2), 'نسخه یا قالب پشتیبان سازگار نیست.');
  const d = backup.data;
  assert(d && ['workshops','products','sizes','rates','audit'].every(k => Array.isArray(d[k as keyof AppData])), 'ساختار پشتیبان ناقص است.');
  const unique = (ids: string[]) => ids.every(x => typeof x === 'string' && !!x) && new Set(ids).size === ids.length;
  assert(unique(d.workshops.map(w => w.id)) && unique(d.products.map(p => p.id)) && unique(d.sizes.map(s => s.id)) && unique(d.rates.map(r => r.id)) && unique(d.audit.map(a => a.id)), 'شناسهٔ تکراری یا نامعتبر در پشتیبان وجود دارد.');
  assert(d.workshops.every(w => validText(w.name) && typeof w.active === 'boolean') && d.sizes.length > 0 && d.sizes.every(s => validText(s.name, 20) && typeof s.active === 'boolean' && Number.isSafeInteger(s.order)), 'تعاریف کارگاه یا سایز معتبر نیست.');
  assert(unique(d.workshops.map(w => clean(w.name))) && unique(d.sizes.map(s => clean(s.name))) && unique(d.products.map(p => clean(p.code))), 'نام یا کد تکراری در پشتیبان وجود دارد.');
  assert(d.products.every(p => validText(p.code, Infinity) && validText(p.name) && typeof p.active === 'boolean' && Array.isArray(p.parts) && p.parts.length >= 1 && unique(p.parts.map(x => x.id)) && unique(p.parts.map(x => clean(x.code))) && p.parts.every(x => validText(x.code, Infinity) && validText(x.name) && validText(x.unit, 30) && typeof x.active === 'boolean' && (x.consumptionQty == null || (Number.isFinite(x.consumptionQty) && x.consumptionQty > 0)))), 'محصول یا اجزای پشتیبان معتبر نیست.');
  assert(d.rates.every(r => r.id === `${r.workshopId}:${r.partId}` && Number.isSafeInteger(r.amountToman) && r.amountToman >= 0 && d.workshops.some(w => w.id === r.workshopId) && d.products.some(p => p.id === r.productId && p.parts.some(x => x.id === r.partId))), 'نرخ‌ها یا ارتباط آن‌ها در پشتیبان معتبر نیست.');
  assert(d.audit.every(a => typeof a.at === 'string' && typeof a.action === 'string' && typeof a.target === 'string' && typeof a.role === 'string'), 'سوابق تغییرات نامعتبر است.');
  assert(d.role === null || d.role?.kind === 'manager' || (d.role?.kind === 'workshop' && d.workshops.some(w => w.id === d.role?.workshopId && w.active)), 'نقش پشتیبان معتبر نیست.');
  if (backup.version === 2) {
    assert(backup.collections && schemaStores.filter(s => s !== 'component_bank').every(s => Array.isArray(backup.collections?.[s])), 'مخزن‌های پشتیبان ناقص‌اند.');
    for (const store of schemaStores.filter(s => Array.isArray(backup.collections?.[s]))) {
      const key = store === 'app_settings' ? 'key' : 'id';
      const rows = backup.collections[store] as Record<string, unknown>[];
      assert(rows.every(row => row && typeof row === 'object' && typeof row[key] === 'string' && !!row[key]) && unique(rows.map(row => row[key] as string)), `اطلاعات ${store} نامعتبر یا تکراری است.`);
    }
    assert(JSON.stringify(backup.collections.workshops) === JSON.stringify(d.workshops) && JSON.stringify(backup.collections.products) === JSON.stringify(d.products), 'داده‌های پشتیبان با یکدیگر سازگار نیستند.');
    if (backup.collections.component_bank) assert(unique((backup.collections.component_bank as Component[]).map(c => clean(c.code))) && (backup.collections.component_bank as Component[]).every(c => validText(c.code, Infinity) && validText(c.name) && validText(c.unit, 30)), 'بانک اجزای پشتیبان معتبر نیست.');
  }
  return { data: d, collections: backup.version === 2 ? backup.collections : undefined };
}

export async function restoreBackup(backup: RestorableBackup): Promise<void> {
  const db = await openData();
  try {
    const tx = db.transaction(schemaStores, 'readwrite');
    const finished = done(tx);
    for (const store of schemaStores) tx.objectStore(store).clear();
    if (backup.collections) {
      for (const store of schemaStores) for (const item of backup.collections[store] ?? []) tx.objectStore(store).put(item);
      if (!backup.collections.component_bank?.length) tx.objectStore('app_settings').delete('component_bank_v1');
    } else {
      // Older backup format contains embedded definitions only. Rebuild only derived records;
      // do not re-run sample seeding, as the owner may have deleted sample records deliberately.
      const d = backup.data;
      for (const store of ['workshops','products','sizes','rates','audit'] as const) for (const item of d[store]) tx.objectStore(store).put(item);
      tx.objectStore('settings').put({ id: 'role', value: d.role });
      tx.objectStore('app_settings').put({ key: 'initial_seed_v2', value: 'done' });
      tx.objectStore('app_settings').put({ key: 'currency_unit', value: 'تومان' });
      for (const [code, title] of [['manager','مدیر'],['workshop','مسئول کارگاه']]) tx.objectStore('user_roles').put({ id: seedId('role',code), code, title, is_active: 1 });
      for (const [code, title, sort_order] of [['SG-A','عددی–حرفی',0],['SG-B','عددی بزرگ (۳۰ تا ۶۰)',1]] as const) tx.objectStore('size_groups').put({ id: seedId('group',code), code, title, sort_order, is_active: 1 });
    }
    tx.objectStore('audit').put({ id: makeId(), at: stamp(), action: 'restore', target: 'بازیابی پشتیبان', role: authenticatedRole?.kind ?? 'بدون نقش' });
    await finished;
    if (!backup.collections) await migrateLegacyOnce(db);
    await reconcileComponents(db);
  } finally { db.close(); }
}
