// In-browser stand-in for the Apps Script server, used by "Try the demo".
// Data lives in this browser only. The sample data is made up.

const KEY = 'mm.demo.v5';
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
  const emp = (name, designation, basicSalary, trackAttendance = true) =>
    ({ id: uid(), name, designation, basicSalary, phone: '', joinDate: '', trackAttendance, active: true, sortOrder: 0 });
  const employees = [
    emp('Sample Mechanic', 'Senior Mechanic', 22000),
    emp('Sample Painter', 'Paint', 18000),
    emp('Sample Helper', 'Asst. Engine Technician', 6000),
    emp('Sample Front Desk', 'CRE', 15000),
    emp('Sample Head', 'Head Of Service', 15000, false),
    emp('Sample Investor', 'Investor', 15000, false),
  ];
  employees.forEach((e, i) => { e.sortOrder = i + 1; });
  const att = (e, day, status) => ({ date: `2026-10-${String(day).padStart(2, '0')}`, employeeId: e.id, status, note: '' });
  return {
    employees,
    attendance: [
      att(employees[0], 1, 'P'), att(employees[1], 1, 'P'), att(employees[2], 1, 'A'), att(employees[3], 1, 'P'),
      att(employees[0], 3, 'A'), att(employees[2], 5, 'A'), att(employees[1], 7, 'L'),
    ],
    payments: [
      { id: uid(), date: '2026-10-05', employeeId: employees[0].id, month: '2026-10', type: 'ADVANCE', amount: 2000, method: 'Cash', note: '', txnId: '', source: 'demo' },
      { id: uid(), date: '2026-10-08', employeeId: employees[2].id, month: '2026-10', type: 'ADVANCE', amount: 1000, method: 'Cash', note: '', txnId: '', source: 'demo' },
    ],
    settings: {
      weeklyOff: 'Fri',
      businessName: 'M & M CAR CLINIC',
      address: 'BAIZID LINK ROAD, AREFIN NAGOR, NEAR SOUTHERN UNIVERSITY',
      phone: '01708-523230',
      preparedBy: 'Manager',
      methods: ['Cash', 'Bank', 'Bkash'],
      startDate: date,
      opening_Cash: 20000,
      opening_Bank: 40000,
      opening_Bkash: 2000,
    },
    categories: {
      IN: ['Customer Payment', 'Other Income'],
      OUT: ['Food', 'Salary', 'Workshop', 'Parts Purchase', 'Commission', 'Utility', 'Rent', 'Transport', 'Other'],
    },
    txns: [
      t('IN', 'INV-001001', 'SAMPLE CUSTOMER A', 3500, 'Cash', 'Customer Payment'),
      t('IN', 'INV-001002', 'SAMPLE CUSTOMER B', 18000, 'Bank', 'Customer Payment'),
      t('IN', 'INV-001003', 'SAMPLE CUSTOMER C', 1200, 'Bkash', 'Customer Payment'),
      t('OUT', '', 'BREAKFAST (FOOD)', 200, 'Cash', 'Food'),
      t('OUT', 'PO-0501', 'PARTS SUPPLIER', 7500, 'Cash', 'Uncategorized'),
      t('OUT', '', 'CLEANING SUPPLIES (WORKSHOP)', 150, 'Cash', 'Workshop'),
      t('OUT', '', 'LUNCH (FOOD)', 600, 'Cash', 'Food'),
      t('OUT', '', 'MECHANIC 1 ADVANCE (SALARY)', 1000, 'Cash', 'Salary'),
      t('OUT', '', 'HELPER DAILY (SALARY)', 300, 'Cash', 'Salary'),
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

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

Object.assign(handlers, {
  employees: () => [...db.employees].sort((a, b) => a.sortOrder - b.sortOrder),
  saveEmployee: ({ employee }) => {
    const e = { ...employee, name: String(employee.name || '').trim(), basicSalary: r2(employee.basicSalary), active: employee.active !== false, trackAttendance: employee.trackAttendance !== false };
    if (!e.name) throw new Error('Employee name is required.');
    if (e.id) {
      const i = find(db.employees, e.id);
      db.employees[i] = { ...db.employees[i], ...e };
    } else {
      e.id = uid();
      e.sortOrder = db.employees.reduce((m, x) => Math.max(m, x.sortOrder), 0) + 1;
      db.employees.push(e);
    }
    return e;
  },
  deleteEmployee: ({ id }) => {
    const i = find(db.employees, id);
    if (db.attendance.some(a => a.employeeId === id) || db.payments.some(p => p.employeeId === id)) {
      db.employees[i].active = false;
      return { archived: true };
    }
    db.employees.splice(i, 1);
    return { deleted: true };
  },
  salaryMonth: ({ month }) => ({
    month,
    employees: handlers.employees(),
    attendance: db.attendance.filter(a => a.date.startsWith(month) && a.status),
    payments: db.payments.filter(p => p.month === month).sort((a, b) => a.date.localeCompare(b.date)),
  }),
  saveAttendance: ({ records }) => {
    records.forEach(r => {
      const i = db.attendance.findIndex(a => a.date === r.date && a.employeeId === r.employeeId);
      if (i >= 0) db.attendance[i] = { ...db.attendance[i], status: r.status };
      else if (r.status) db.attendance.push({ date: r.date, employeeId: r.employeeId, status: r.status, note: '' });
    });
    return { saved: records.length };
  },
  addSalaryPayment: ({ payment, cash }) => {
    const e = db.employees[find(db.employees, payment.employeeId)];
    const p = { ...payment, id: uid(), amount: r2(payment.amount), txnId: '', source: 'app' };
    if (!(p.amount > 0)) throw new Error('Amount must be more than 0.');
    if (cash) {
      const mon = MONTHS[Number(p.month.slice(5, 7)) - 1];
      p.txnId = addTxn({
        date: p.date, type: 'OUT', category: 'Salary', amount: p.amount, method: p.method, note: p.note || 'From salary tracker',
        description: `${e.name.toUpperCase()} ${mon}${p.type === 'ADVANCE' ? ' ADV' : ' SALARY'} (SALARY)`,
      }).id;
    }
    db.payments.push(p);
    return { id: p.id, txnId: p.txnId };
  },
  deleteSalaryPayment: ({ id }) => {
    const [p] = db.payments.splice(find(db.payments, id), 1);
    const ti = db.txns.findIndex(t => t.id === p.txnId);
    if (ti >= 0) db.txns.splice(ti, 1);
    return { deleted: true };
  },
});

export async function mockCall(action, params) {
  await new Promise(r => setTimeout(r, 120));
  load();
  const fn = handlers[action];
  if (!fn) throw new Error(`Unknown action: ${action}`);
  const out = fn(params || {});
  persist();
  return JSON.parse(JSON.stringify(out ?? null));
}
