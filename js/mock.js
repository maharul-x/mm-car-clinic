// In-browser stand-in for the Apps Script server, used by "Try the demo".
// Data lives in this browser only and starts from the real 1 Oct 2026 ledger.

const KEY = 'mm.demo.v1';
let db = null;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const stamp = () => new Date().toISOString();
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

function seed() {
  const date = '2026-10-01';
  const t = (type, invoice, description, amount, method, category) =>
    ({ id: uid(), date, type, invoice, description, category, amount, method, toMethod: '', note: '', source: 'demo', createdAt: '2026-10-01T09:00:00' });
  const items = [
    { id: uid(), sku: 'OIL-5W30-4L', name: 'Engine oil 5W-30 (4 L)', category: 'Lubricants', unit: 'can', costPrice: 3200, salePrice: 3800, reorderLevel: 5, active: true },
    { id: uid(), sku: 'FLT-OIL-TY', name: 'Oil filter (Toyota)', category: 'Filters', unit: 'pcs', costPrice: 350, salePrice: 550, reorderLevel: 10, active: true },
    { id: uid(), sku: 'FLT-AIR-TY', name: 'Air filter (Toyota)', category: 'Filters', unit: 'pcs', costPrice: 600, salePrice: 900, reorderLevel: 5, active: true },
    { id: uid(), sku: 'BRK-PAD-F', name: 'Brake pad set (front)', category: 'Brakes', unit: 'set', costPrice: 2200, salePrice: 3000, reorderLevel: 3, active: true },
  ];
  const move = (item, type, qty, note) =>
    ({ id: uid(), date, itemId: item.id, type, qty, unitPrice: item.costPrice, reference: '', note, txnId: '', createdAt: '2026-10-01T09:00:00' });
  return {
    settings: {
      businessName: 'M & M CAR CLINIC',
      address: 'BAIZID LINK ROAD, AREFIN NAGOR, NEAR SOUTHERN UNIVERSITY',
      phone: '01708-523230',
      preparedBy: 'Mohammad Maharul Islam',
      methods: ['Cash', 'Bank', 'Bkash'],
      startDate: date,
      opening_Cash: 23496,
      opening_Bank: 36932,
      opening_Bkash: 1750,
    },
    categories: {
      IN: ['Customer Payment', 'Other Income'],
      OUT: ['Food', 'Salary', 'Workshop', 'Parts Purchase', 'Commission', 'Utility', 'Rent', 'Transport', 'Other'],
    },
    txns: [
      t('IN', 'INV-000475', 'MR. ARIF', 2000, 'Cash', 'Customer Payment'),
      t('IN', 'INV-000393', 'DR. SM AHASANUL KARIM', 20000, 'Bank', 'Customer Payment'),
      t('IN', 'INV-000478', 'MR.BELAL', 500, 'Cash', 'Customer Payment'),
      t('IN', 'INV-000479', 'MR. ARSHASD ALAM', 500, 'Cash', 'Customer Payment'),
      t('IN', 'INV-000414', 'MR.SHAHJAHAN', 15000, 'Bank', 'Customer Payment'),
      t('OUT', '', 'NASTA (FOOD)', 190, 'Cash', 'Food'),
      t('OUT', 'INV-000442', 'BCM - MANIK', 11000, 'Cash', 'Uncategorized'),
      t('OUT', '', 'FOR TISSUE - WAJED  (workshop)', 80, 'Cash', 'Workshop'),
      t('OUT', 'INV-000476', 'DRIVER COMMISION', 500, 'Cash', 'Uncategorized'),
      t('OUT', '', 'LUNCH (FOOD)', 560, 'Cash', 'Food'),
      t('OUT', '', 'COFFE+BISCUIT (FOOD)', 150, 'Cash', 'Food'),
      t('OUT', '', 'FAHIM (salary)', 100, 'Cash', 'Salary'),
      t('OUT', '', 'RIFAT (salary)', 150, 'Cash', 'Salary'),
      t('OUT', '', 'RUBEL SEP ADV (SALARY)', 1000, 'Cash', 'Salary'),
      t('OUT', '', 'RONY SEP ADV (SALARY)', 1000, 'Cash', 'Salary'),
      t('OUT', '', 'OIL FILLER (WORKSHOP)', 20, 'Cash', 'Workshop'),
    ],
    items,
    moves: [
      move(items[0], 'ADJUST', 8, 'Opening stock'),
      move(items[1], 'ADJUST', 6, 'Opening stock'),
      move(items[2], 'ADJUST', 9, 'Opening stock'),
      move(items[3], 'ADJUST', 2, 'Opening stock'),
    ],
  };
}

function load() {
  if (db) return db;
  try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { db = null; }
  if (!db) db = seed();
  return db;
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* demo still works in memory */ }
}

export function resetDemo() {
  db = seed();
  persist();
}

function settings() {
  const s = { ...db.settings };
  s.methods.forEach(m => { s[`opening_${m}`] = Number(s[`opening_${m}`]) || 0; });
  return s;
}

function apply(bal, t) {
  if (t.type === 'IN') bal[t.method] = (bal[t.method] || 0) + t.amount;
  else if (t.type === 'OUT') bal[t.method] = (bal[t.method] || 0) - t.amount;
  else {
    bal[t.method] = (bal[t.method] || 0) - t.amount;
    bal[t.toMethod] = (bal[t.toMethod] || 0) + t.amount;
  }
}

function validateTxn(x) {
  const s = settings();
  const t = { ...x, type: String(x.type).toUpperCase(), amount: r2(x.amount), description: String(x.description || '').trim() };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date || '')) throw new Error('Choose a valid date.');
  if (!(t.amount > 0)) throw new Error('Amount must be more than 0.');
  if (!s.methods.includes(t.method)) throw new Error(`Unknown payment method: ${t.method}`);
  if (t.type === 'TRANSFER') {
    if (!s.methods.includes(t.toMethod) || t.toMethod === t.method) throw new Error('Choose two different accounts for a transfer.');
    t.category = 'Transfer';
    t.description ||= `${t.method} → ${t.toMethod}`;
  } else {
    t.toMethod = '';
    if (!t.description) throw new Error('Description is required.');
    t.category ||= 'Uncategorized';
  }
  return t;
}

const find = (list, id) => {
  const i = list.findIndex(x => x.id === id);
  if (i < 0) throw new Error('That record was not found. It may have been deleted; refresh and try again.');
  return i;
};

function addTxn(txn) {
  const t = { ...validateTxn(txn), id: uid(), source: 'app', createdAt: stamp() };
  db.txns.push(t);
  return { id: t.id };
}

const handlers = {
  ping: () => ({ settings: settings() }),
  meta: () => ({ settings: settings(), categories: db.categories }),
  range: ({ from, to }) => {
    const s = settings();
    const opening = {};
    s.methods.forEach(m => { opening[m] = s[`opening_${m}`]; });
    const txns = [];
    db.txns.forEach(t => {
      if (s.startDate && t.date < s.startDate) return;
      if (t.date < from) apply(opening, t);
      else if (t.date <= to) txns.push(t);
    });
    txns.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    return { from, to, opening, txns };
  },
  addTxn: ({ txn }) => addTxn(txn),
  updateTxn: ({ txn }) => {
    const i = find(db.txns, txn.id);
    db.txns[i] = { ...db.txns[i], ...validateTxn(txn) };
    return { id: txn.id };
  },
  deleteTxn: ({ id }) => {
    db.txns.splice(find(db.txns, id), 1);
    return { deleted: true };
  },
  saveSettings: ({ settings: input }) => {
    Object.entries(input).forEach(([k, v]) => {
      if (k === 'methods') v = (Array.isArray(v) ? v : String(v).split(',')).map(x => String(x).trim()).filter(Boolean);
      else if (k.startsWith('opening_')) v = r2(v);
      db.settings[k] = v;
    });
    if (!db.settings.methods.length) throw new Error('Keep at least one payment method.');
    return settings();
  },
  saveCategories: ({ categories }) => {
    const clean = list => [...new Map((list || []).map(n => String(n).trim()).filter(Boolean).map(n => [n.toLowerCase(), n])).values()];
    const c = { IN: clean(categories.IN), OUT: clean(categories.OUT) };
    if (!c.IN.length || !c.OUT.length) throw new Error('Keep at least one cash-in and one cash-out category.');
    db.categories = c;
    return c;
  },
  inventory: () => {
    const qty = {};
    db.moves.forEach(m => { qty[m.itemId] = (qty[m.itemId] || 0) + (m.type === 'OUT' ? -m.qty : m.qty); });
    return db.items.map(i => ({ ...i, qty: r2(qty[i.id] || 0) }));
  },
  saveItem: ({ item, openingQty }) => {
    const it = {
      ...item,
      name: String(item.name || '').trim(),
      unit: item.unit || 'pcs',
      costPrice: r2(item.costPrice),
      salePrice: r2(item.salePrice),
      reorderLevel: r2(item.reorderLevel),
      active: true,
    };
    if (!it.name) throw new Error('Item name is required.');
    if (it.sku && db.items.some(x => x.sku.toLowerCase() === it.sku.toLowerCase() && x.id !== it.id)) {
      throw new Error(`Another item already uses SKU ${it.sku}.`);
    }
    if (it.id) db.items[find(db.items, it.id)] = it;
    else {
      it.id = uid();
      db.items.push(it);
      const q = r2(openingQty);
      if (q) db.moves.push({ id: uid(), date: new Date().toISOString().slice(0, 10), itemId: it.id, type: 'ADJUST', qty: q, unitPrice: it.costPrice, reference: '', note: 'Opening stock', txnId: '', createdAt: stamp() });
    }
    return it;
  },
  deleteItem: ({ id }) => {
    const i = find(db.items, id);
    if (db.moves.some(m => m.itemId === id)) {
      db.items[i].active = false;
      return { archived: true };
    }
    db.items.splice(i, 1);
    return { deleted: true };
  },
  addMove: ({ move, cash }) => {
    const item = db.items[find(db.items, move.itemId)];
    const m = { ...move, id: uid(), qty: r2(move.qty), unitPrice: r2(move.unitPrice), txnId: '', createdAt: stamp() };
    if (m.type === 'ADJUST' ? m.qty === 0 : !(m.qty > 0)) throw new Error('Enter a quantity.');
    if (cash && m.type !== 'ADJUST') {
      const amount = r2(m.qty * m.unitPrice);
      if (!(amount > 0)) throw new Error('Enter a unit price to record this in the cash book.');
      m.txnId = addTxn({
        date: m.date,
        type: m.type === 'IN' ? 'OUT' : 'IN',
        invoice: m.reference,
        description: `${item.name} × ${m.qty} ${item.unit}`,
        category: cash.category,
        amount,
        method: cash.method,
        note: m.type === 'IN' ? 'Inventory: stock in' : 'Inventory: stock out',
      }).id;
    }
    db.moves.push(m);
    return { id: m.id, txnId: m.txnId };
  },
  moves: ({ itemId }) =>
    db.moves
      .filter(m => !itemId || m.itemId === itemId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
  deleteMove: ({ id }) => {
    const [m] = db.moves.splice(find(db.moves, id), 1);
    const ti = db.txns.findIndex(t => t.id === m.txnId);
    if (ti >= 0) db.txns.splice(ti, 1);
    return { deleted: true };
  },
};

export async function mockCall(action, params) {
  await new Promise(r => setTimeout(r, 120));
  load();
  const fn = handlers[action];
  if (!fn) throw new Error(`Unknown action: ${action}`);
  const out = fn(params || {});
  persist();
  return JSON.parse(JSON.stringify(out ?? null));
}
