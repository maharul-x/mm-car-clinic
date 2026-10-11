/**
 * M&M Car Clinic — Google Sheets backend.
 *
 * Paste this file into Extensions → Apps Script of the Google Sheet that is
 * the database, then deploy it as a Web app. See README.md for the steps.
 *
 * Every request is a POST with a JSON body: { action, pin (the app password), ...params }.
 * Replies are { ok: true, data } or { ok: false, error, code }.
 */

const TABS = {
  TXN: { name: 'Transactions', headers: ['id', 'date', 'type', 'invoice', 'description', 'category', 'amount', 'method', 'toMethod', 'note', 'source', 'createdAt', 'updatedAt'] },
  CAT: { name: 'Categories', headers: ['type', 'name'] },
  SET: { name: 'Settings', headers: ['key', 'value'] },
  ITEM: { name: 'Inventory', headers: ['id', 'sku', 'name', 'category', 'unit', 'costPrice', 'salePrice', 'reorderLevel', 'active', 'createdAt', 'updatedAt'] },
  MOVE: { name: 'StockMoves', headers: ['id', 'date', 'itemId', 'type', 'qty', 'unitPrice', 'reference', 'note', 'txnId', 'createdAt'] },
  EMP: { name: 'Employees', headers: ['id', 'name', 'designation', 'basicSalary', 'phone', 'joinDate', 'trackAttendance', 'active', 'sortOrder', 'createdAt', 'updatedAt'] },
  ATT: { name: 'Attendance', headers: ['key', 'date', 'employeeId', 'status', 'note', 'updatedAt'] },
  PAY: { name: 'SalaryPayments', headers: ['id', 'date', 'employeeId', 'month', 'type', 'amount', 'method', 'note', 'txnId', 'source', 'createdAt'] },
};

const DEFAULT_SETTINGS = {
  businessName: 'M & M CAR CLINIC',
  address: 'BAIZID LINK ROAD, AREFIN NAGOR, NEAR SOUTHERN UNIVERSITY',
  phone: '01708-523230',
  preparedBy: '',
  methods: 'Cash,Bank,Bkash',
  startDate: '',
  weeklyOff: 'Fri',
};

const DEFAULT_CATEGORIES = {
  IN: ['Customer Payment', 'Other Income'],
  OUT: ['Food', 'Salary', 'Workshop', 'Parts Purchase', 'Commission', 'Utility', 'Rent', 'Transport', 'Other'],
};

const TXN_TYPES = ['IN', 'OUT', 'TRANSFER'];
const MOVE_TYPES = ['IN', 'OUT', 'ADJUST'];
const ATT_STATUSES = ['P', 'A', 'L', 'O', ''];
const PAY_TYPES = ['ADVANCE', 'SALARY'];
// Designations whose salary is never cut for absence.
const NO_DEDUCTION = /invest|head\s+of/i;
const SETTING_KEYS = /^(businessName|address|phone|preparedBy|methods|startDate|weeklyOff|opening_[A-Za-z0-9 ]+)$/;
// Columns written as real dates; every other string is forced to plain text.
const DATE_FIELDS = ['date', 'joinDate', 'createdAt', 'updatedAt'];

// ───────────────────────────── Sheet menu ─────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('M&M App')
    .addItem('1. Set up / repair tabs', 'setup')
    .addItem('2. Set app password', 'setPin')
    .addItem('3. Import old daily sheets', 'importLegacySheets')
    .addItem('4. Import employees from a salary sheet', 'importSalarySheet')
    .addToUi();
}

function setup() {
  ensureTabs_();
  SpreadsheetApp.getActive().toast('Tabs are ready.', 'M&M App');
}

function ensureTabs_() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(TABS).forEach(k => {
    const tab = TABS[k];
    let sh = ss.getSheetByName(tab.name);
    if (!sh) sh = ss.insertSheet(tab.name);
    if (sh.getRange(1, 1).getValue() === '') {
      sh.getRange(1, 1, 1, tab.headers.length).setValues([tab.headers]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  });

  const cat = ss.getSheetByName(TABS.CAT.name);
  if (cat.getLastRow() < 2) {
    const rows = [];
    Object.keys(DEFAULT_CATEGORIES).forEach(t => DEFAULT_CATEGORIES[t].forEach(n => rows.push([t, n])));
    cat.getRange(2, 1, rows.length, 2).setValues(rows);
  }

  const set = ss.getSheetByName(TABS.SET.name);
  if (set.getLastRow() < 2) {
    const rows = Object.keys(DEFAULT_SETTINGS).map(k => [k, DEFAULT_SETTINGS[k]]);
    String(DEFAULT_SETTINGS.methods).split(',').forEach(m => rows.push(['opening_' + m, 0]));
    set.getRange(2, 1, rows.length, 2).setValues(rows.map(r => [r[0], safe_(r[1], 'value')]));
  }
}

function setPin() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Set app password', 'Choose a password of at least 8 characters. Everyone who uses the app signs in with it.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const pin = res.getResponseText().trim();
  if (pin.length < 8) {
    ui.alert('The password must be at least 8 characters. Nothing was changed.');
    return;
  }
  PropertiesService.getScriptProperties().setProperty('APP_PIN', pin);
  CacheService.getScriptCache().remove('pinFails');
  ui.alert('Password saved. Anyone signed in with the old password will need the new one.');
}

// ───────────────────────────── Web API ─────────────────────────────

const API = {
  ping: () => ({ settings: readSettings_() }),
  meta: () => ({ settings: readSettings_(), categories: readCategories_() }),
  range: req => range_(req.from, req.to),
  addTxn: req => saveTxn_(req.txn, false),
  updateTxn: req => saveTxn_(req.txn, true),
  deleteTxn: req => deleteRowById_(TABS.TXN, req.id),
  saveSettings: req => saveSettings_(req.settings),
  saveCategories: req => saveCategories_(req.categories),
  inventory: () => inventory_(),
  saveItem: req => saveItem_(req.item, req.openingQty),
  deleteItem: req => deleteItem_(req.id),
  addMove: req => addMove_(req),
  moves: req => moves_(req.itemId),
  deleteMove: req => deleteMove_(req.id),
  employees: () => employees_(),
  saveEmployee: req => saveEmployee_(req.employee),
  deleteEmployee: req => deleteEmployee_(req.id),
  salaryMonth: req => salaryMonth_(req.month),
  saveAttendance: req => saveAttendance_(req.records),
  addSalaryPayment: req => addSalaryPayment_(req),
  deleteSalaryPayment: req => deleteSalaryPayment_(req.id),
};
const WRITES = ['addTxn', 'updateTxn', 'deleteTxn', 'saveSettings', 'saveCategories', 'saveItem', 'deleteItem', 'addMove', 'deleteMove',
  'saveEmployee', 'deleteEmployee', 'saveAttendance', 'addSalaryPayment', 'deleteSalaryPayment'];

function doGet() {
  return json_({ ok: true, data: { app: 'M&M Car Clinic API' } });
}

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    checkPin_(req.pin);
    const fn = API[req.action];
    if (!fn) throw new Error('Unknown action: ' + req.action);
    const data = WRITES.indexOf(req.action) >= 0 ? withLock_(() => fn(req)) : fn(req);
    return json_({ ok: true, data: data });
  } catch (err) {
    return json_({ ok: false, error: err.message, code: err.code || '' });
  }
}

function checkPin_(pin) {
  const expected = PropertiesService.getScriptProperties().getProperty('APP_PIN');
  if (!expected) throw codeError_('No password has been set yet. In the Google Sheet, use M&M App → Set app password.', 'AUTH');
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('pinFails') || 0);
  if (fails >= 10) throw codeError_('Too many wrong password attempts. Try again in 15 minutes.', 'AUTH');
  if (String(pin || '') !== expected) {
    cache.put('pinFails', String(fails + 1), 900);
    throw codeError_('Wrong password.', 'AUTH');
  }
}

// ───────────────────────────── Cash book ─────────────────────────────

function range_(from, to) {
  if (!isDate_(from) || !isDate_(to) || from > to) throw new Error('Invalid date range.');
  const s = readSettings_();
  const opening = {};
  s.methods.forEach(m => { opening[m] = s['opening_' + m]; });
  const txns = [];
  readRows_(TABS.TXN).map(cleanTxn_).forEach(t => {
    if (s.startDate && t.date < s.startDate) return;
    if (t.date < from) applyTxn_(opening, t);
    else if (t.date <= to) txns.push(t);
  });
  txns.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  return { from: from, to: to, opening: opening, txns: txns };
}

function applyTxn_(bal, t) {
  const a = Number(t.amount) || 0;
  if (t.type === 'IN') bal[t.method] = (bal[t.method] || 0) + a;
  else if (t.type === 'OUT') bal[t.method] = (bal[t.method] || 0) - a;
  else if (t.type === 'TRANSFER') {
    bal[t.method] = (bal[t.method] || 0) - a;
    bal[t.toMethod] = (bal[t.toMethod] || 0) + a;
  }
}

function validateTxn_(x, s) {
  x = x || {};
  const t = {
    id: str_(x.id, 64),
    date: str_(x.date, 10),
    type: str_(x.type, 10).toUpperCase(),
    invoice: str_(x.invoice, 40),
    description: str_(x.description, 200),
    category: str_(x.category, 60),
    amount: num_(x.amount),
    method: str_(x.method, 30),
    toMethod: str_(x.toMethod, 30),
    note: str_(x.note, 300),
  };
  if (!isDate_(t.date)) throw new Error('Choose a valid date.');
  if (TXN_TYPES.indexOf(t.type) < 0) throw new Error('Unknown entry type.');
  if (!(t.amount > 0)) throw new Error('Amount must be more than 0.');
  if (s.methods.indexOf(t.method) < 0) throw new Error('Unknown payment method: ' + t.method);
  if (t.type === 'TRANSFER') {
    if (s.methods.indexOf(t.toMethod) < 0 || t.toMethod === t.method) throw new Error('Choose two different accounts for a transfer.');
    t.category = 'Transfer';
    if (!t.description) t.description = t.method + ' → ' + t.toMethod;
  } else {
    t.toMethod = '';
    if (!t.description) throw new Error('Description is required.');
    if (!t.category) t.category = 'Uncategorized';
  }
  return t;
}

function saveTxn_(input, isUpdate) {
  const t = validateTxn_(input, readSettings_());
  const sh = sheet_(TABS.TXN);
  const now = new Date();
  if (isUpdate) {
    const row = findRow_(TABS.TXN, t.id);
    const old = readRow_(TABS.TXN, row);
    t.source = old.source;
    t.createdAt = old.createdAt;
    t.updatedAt = now;
    sh.getRange(row, 1, 1, TABS.TXN.headers.length).setValues([toRow_(TABS.TXN, t)]);
  } else {
    t.id = Utilities.getUuid();
    t.source = 'app';
    t.createdAt = now;
    t.updatedAt = now;
    sh.appendRow(toRow_(TABS.TXN, t));
  }
  return { id: t.id };
}

function cleanTxn_(r) {
  return {
    id: String(r.id),
    date: String(r.date).slice(0, 10),
    type: String(r.type).toUpperCase(),
    invoice: String(r.invoice),
    description: String(r.description),
    category: String(r.category),
    amount: Number(r.amount) || 0,
    method: String(r.method),
    toMethod: String(r.toMethod),
    note: String(r.note),
    source: String(r.source),
    createdAt: String(r.createdAt),
  };
}

// ───────────────────────────── Settings & categories ─────────────────────────────

function readSettings_() {
  const s = Object.assign({}, DEFAULT_SETTINGS);
  readRows_(TABS.SET).forEach(r => { s[String(r.key)] = r.value; });
  s.methods = String(s.methods).split(',').map(x => x.trim()).filter(String);
  s.startDate = s.startDate ? String(s.startDate).slice(0, 10) : '';
  s.methods.forEach(m => { s['opening_' + m] = Number(s['opening_' + m]) || 0; });
  return s;
}

function saveSettings_(input) {
  input = input || {};
  const sh = sheet_(TABS.SET);
  const at = {};
  readRows_(TABS.SET).forEach(r => { at[String(r.key)] = r._row; });
  Object.keys(input).forEach(key => {
    if (!SETTING_KEYS.test(key)) return;
    let v = input[key];
    if (key === 'methods') {
      v = (Array.isArray(v) ? v : String(v).split(',')).map(x => str_(x, 30)).filter(String);
      if (!v.length) throw new Error('Keep at least one payment method.');
      v = v.join(',');
    } else if (key === 'startDate') {
      v = str_(v, 10);
      if (v && !isDate_(v)) throw new Error('Invalid start date.');
    } else if (key.indexOf('opening_') === 0) {
      v = num_(v);
    } else if (key === 'weeklyOff') {
      v = str_(v, 40);
    } else {
      v = str_(v, 200);
    }
    const cell = safe_(v, key === 'startDate' ? 'date' : 'value');
    if (at[key]) sh.getRange(at[key], 2).setValue(cell);
    else {
      sh.appendRow([key, cell]);
      at[key] = sh.getLastRow();
    }
  });
  return readSettings_();
}

function readCategories_() {
  const c = { IN: [], OUT: [] };
  readRows_(TABS.CAT).forEach(r => {
    const t = String(r.type).toUpperCase();
    const n = String(r.name);
    if (c[t] && n && c[t].indexOf(n) < 0) c[t].push(n);
  });
  return c;
}

function saveCategories_(input) {
  input = input || {};
  const rows = [];
  ['IN', 'OUT'].forEach(t => {
    const seen = {};
    (input[t] || []).forEach(n => {
      n = str_(n, 60);
      if (n && !seen[n.toLowerCase()]) {
        seen[n.toLowerCase()] = true;
        rows.push([t, safe_(n, 'name')]);
      }
    });
  });
  if (!rows.some(r => r[0] === 'IN') || !rows.some(r => r[0] === 'OUT')) {
    throw new Error('Keep at least one cash-in and one cash-out category.');
  }
  const sh = sheet_(TABS.CAT);
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, 2).clearContent();
  sh.getRange(2, 1, rows.length, 2).setValues(rows);
  return readCategories_();
}

// ───────────────────────────── Inventory ─────────────────────────────

function cleanItem_(r) {
  return {
    id: String(r.id),
    sku: String(r.sku),
    name: String(r.name),
    category: String(r.category),
    unit: String(r.unit || 'pcs'),
    costPrice: Number(r.costPrice) || 0,
    salePrice: Number(r.salePrice) || 0,
    reorderLevel: Number(r.reorderLevel) || 0,
    active: r.active !== false && String(r.active).toUpperCase() !== 'FALSE',
  };
}

function inventory_() {
  const qty = {};
  readRows_(TABS.MOVE).forEach(m => {
    const q = Number(m.qty) || 0;
    qty[m.itemId] = (qty[m.itemId] || 0) + (String(m.type).toUpperCase() === 'OUT' ? -q : q);
  });
  return readRows_(TABS.ITEM).map(cleanItem_).map(i => {
    i.qty = Math.round((qty[i.id] || 0) * 100) / 100;
    return i;
  });
}

function saveItem_(x, openingQty) {
  x = x || {};
  const it = {
    id: str_(x.id, 64),
    sku: str_(x.sku, 40),
    name: str_(x.name, 120),
    category: str_(x.category, 60),
    unit: str_(x.unit, 20) || 'pcs',
    costPrice: num_(x.costPrice),
    salePrice: num_(x.salePrice),
    reorderLevel: num_(x.reorderLevel),
    active: true,
  };
  if (!it.name) throw new Error('Item name is required.');
  if (it.costPrice < 0 || it.salePrice < 0 || it.reorderLevel < 0) throw new Error('Prices and reorder level cannot be negative.');
  if (it.sku) {
    const clash = readRows_(TABS.ITEM).some(r => String(r.sku).toLowerCase() === it.sku.toLowerCase() && String(r.id) !== it.id);
    if (clash) throw new Error('Another item already uses SKU ' + it.sku + '.');
  }
  const sh = sheet_(TABS.ITEM);
  const now = new Date();
  if (it.id) {
    const row = findRow_(TABS.ITEM, it.id);
    it.createdAt = readRow_(TABS.ITEM, row).createdAt;
    it.updatedAt = now;
    sh.getRange(row, 1, 1, TABS.ITEM.headers.length).setValues([toRow_(TABS.ITEM, it)]);
  } else {
    it.id = Utilities.getUuid();
    it.createdAt = now;
    it.updatedAt = now;
    sh.appendRow(toRow_(TABS.ITEM, it));
    const q = num_(openingQty);
    if (q) appendMove_({ date: today_(), itemId: it.id, type: 'ADJUST', qty: q, unitPrice: it.costPrice, reference: '', note: 'Opening stock', txnId: '' });
  }
  return cleanItem_(it);
}

function deleteItem_(id) {
  const row = findRow_(TABS.ITEM, id);
  const used = readRows_(TABS.MOVE).some(m => String(m.itemId) === String(id));
  if (used) {
    // Keep the history: archive instead of deleting.
    sheet_(TABS.ITEM).getRange(row, TABS.ITEM.headers.indexOf('active') + 1).setValue(false);
    return { archived: true };
  }
  sheet_(TABS.ITEM).deleteRow(row);
  return { deleted: true };
}

function addMove_(req) {
  const x = req.move || {};
  const m = {
    date: str_(x.date, 10),
    itemId: str_(x.itemId, 64),
    type: str_(x.type, 10).toUpperCase(),
    qty: num_(x.qty),
    unitPrice: num_(x.unitPrice),
    reference: str_(x.reference, 60),
    note: str_(x.note, 300),
    txnId: '',
  };
  if (!isDate_(m.date)) throw new Error('Choose a valid date.');
  if (MOVE_TYPES.indexOf(m.type) < 0) throw new Error('Unknown stock movement type.');
  if (m.type === 'ADJUST' ? m.qty === 0 : !(m.qty > 0)) throw new Error('Enter a quantity.');
  if (m.unitPrice < 0) throw new Error('Unit price cannot be negative.');
  const item = cleanItem_(readRow_(TABS.ITEM, findRow_(TABS.ITEM, m.itemId)));

  if (req.cash && m.type !== 'ADJUST') {
    const amount = Math.round(m.qty * m.unitPrice * 100) / 100;
    if (!(amount > 0)) throw new Error('Enter a unit price to record this in the cash book.');
    const txn = saveTxn_({
      date: m.date,
      type: m.type === 'IN' ? 'OUT' : 'IN',
      invoice: m.reference,
      description: item.name + ' × ' + m.qty + ' ' + item.unit,
      category: req.cash.category,
      amount: amount,
      method: req.cash.method,
      note: m.type === 'IN' ? 'Inventory: stock in' : 'Inventory: stock out',
    }, false);
    m.txnId = txn.id;
  }
  return appendMove_(m);
}

function appendMove_(m) {
  m.id = Utilities.getUuid();
  m.createdAt = new Date();
  sheet_(TABS.MOVE).appendRow(toRow_(TABS.MOVE, m));
  return { id: m.id, txnId: m.txnId };
}

function moves_(itemId) {
  return readRows_(TABS.MOVE)
    .filter(m => !itemId || String(m.itemId) === String(itemId))
    .map(m => ({
      id: String(m.id),
      date: String(m.date).slice(0, 10),
      itemId: String(m.itemId),
      type: String(m.type).toUpperCase(),
      qty: Number(m.qty) || 0,
      unitPrice: Number(m.unitPrice) || 0,
      reference: String(m.reference),
      note: String(m.note),
      txnId: String(m.txnId),
      createdAt: String(m.createdAt),
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

function deleteMove_(id) {
  const row = findRow_(TABS.MOVE, id);
  const txnId = String(readRow_(TABS.MOVE, row).txnId || '');
  sheet_(TABS.MOVE).deleteRow(row);
  if (txnId) {
    try { deleteRowById_(TABS.TXN, txnId); } catch (e) { /* cash entry was already deleted */ }
  }
  return { deleted: true };
}

// ───────────────────────────── Employees, attendance & salary ─────────────────────────────

function cleanEmp_(r) {
  const flag = v => v !== false && String(v).toUpperCase() !== 'FALSE';
  return {
    id: String(r.id),
    name: String(r.name),
    designation: String(r.designation),
    basicSalary: Number(r.basicSalary) || 0,
    phone: String(r.phone),
    joinDate: r.joinDate ? String(r.joinDate).slice(0, 10) : '',
    trackAttendance: flag(r.trackAttendance),
    active: flag(r.active),
    sortOrder: Number(r.sortOrder) || 0,
  };
}

function employees_() {
  return readRows_(TABS.EMP).map(cleanEmp_).sort((a, b) => a.sortOrder - b.sortOrder);
}

function saveEmployee_(x) {
  x = x || {};
  const e = {
    id: str_(x.id, 64),
    name: str_(x.name, 100),
    designation: str_(x.designation, 100),
    basicSalary: num_(x.basicSalary),
    phone: str_(x.phone, 40),
    joinDate: str_(x.joinDate, 10),
    trackAttendance: x.trackAttendance !== false,
    active: x.active !== false,
  };
  if (!e.name) throw new Error('Employee name is required.');
  if (e.basicSalary < 0) throw new Error('Basic salary cannot be negative.');
  if (e.joinDate && !isDate_(e.joinDate)) throw new Error('Invalid joining date.');
  const sh = sheet_(TABS.EMP);
  const now = new Date();
  if (e.id) {
    const row = findRow_(TABS.EMP, e.id);
    const old = readRow_(TABS.EMP, row);
    e.sortOrder = old.sortOrder;
    e.createdAt = old.createdAt;
    e.updatedAt = now;
    sh.getRange(row, 1, 1, TABS.EMP.headers.length).setValues([toRow_(TABS.EMP, e)]);
  } else {
    e.id = Utilities.getUuid();
    e.sortOrder = employees_().reduce((m, r) => Math.max(m, r.sortOrder), 0) + 1;
    e.createdAt = now;
    e.updatedAt = now;
    sh.appendRow(toRow_(TABS.EMP, e));
  }
  return cleanEmp_(e);
}

function deleteEmployee_(id) {
  const row = findRow_(TABS.EMP, id);
  const used = readRows_(TABS.ATT).some(a => String(a.employeeId) === String(id) && a.status) ||
    readRows_(TABS.PAY).some(p => String(p.employeeId) === String(id));
  if (used) {
    // Keep attendance and payment history: archive instead of deleting.
    sheet_(TABS.EMP).getRange(row, TABS.EMP.headers.indexOf('active') + 1).setValue(false);
    return { archived: true };
  }
  sheet_(TABS.EMP).deleteRow(row);
  return { deleted: true };
}

function salaryMonth_(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) throw new Error('Invalid month.');
  return {
    month: month,
    employees: employees_(),
    attendance: readRows_(TABS.ATT)
      .filter(a => String(a.date).slice(0, 7) === month && a.status)
      .map(a => ({ date: String(a.date).slice(0, 10), employeeId: String(a.employeeId), status: String(a.status), note: String(a.note) })),
    payments: readRows_(TABS.PAY)
      .filter(p => String(p.month) === month)
      .map(cleanPay_)
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function saveAttendance_(records) {
  if (!Array.isArray(records) || !records.length) throw new Error('Nothing to save.');
  if (records.length > 3000) throw new Error('Too many changes at once. Save in smaller batches.');
  const ids = {};
  employees_().forEach(e => { ids[e.id] = true; });
  const sh = sheet_(TABS.ATT);
  const at = {};
  readRows_(TABS.ATT).forEach(r => { at[String(r.key)] = r._row; });
  const now = new Date();
  const appends = [];
  records.forEach(x => {
    const a = { date: str_(x.date, 10), employeeId: str_(x.employeeId, 64), status: str_(x.status, 1).toUpperCase(), note: str_(x.note, 200), updatedAt: now };
    if (!isDate_(a.date)) throw new Error('Invalid attendance date.');
    if (!ids[a.employeeId]) throw new Error('Unknown employee in attendance.');
    if (ATT_STATUSES.indexOf(a.status) < 0) throw new Error('Unknown attendance status: ' + a.status);
    a.key = a.date + '|' + a.employeeId;
    const row = toRow_(TABS.ATT, a);
    if (at[a.key]) sh.getRange(at[a.key], 1, 1, row.length).setValues([row]);
    else if (a.status) appends.push(row);
  });
  if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, appends[0].length).setValues(appends);
  return { saved: records.length };
}

function cleanPay_(p) {
  return {
    id: String(p.id),
    date: String(p.date).slice(0, 10),
    employeeId: String(p.employeeId),
    month: String(p.month),
    type: String(p.type).toUpperCase(),
    amount: Number(p.amount) || 0,
    method: String(p.method),
    note: String(p.note),
    txnId: String(p.txnId),
    source: String(p.source),
  };
}

function addSalaryPayment_(req) {
  const x = req.payment || {};
  const s = readSettings_();
  const p = {
    date: str_(x.date, 10),
    employeeId: str_(x.employeeId, 64),
    month: str_(x.month, 7),
    type: str_(x.type, 10).toUpperCase(),
    amount: num_(x.amount),
    method: str_(x.method, 30),
    note: str_(x.note, 200),
    txnId: '',
    source: 'app',
  };
  if (!isDate_(p.date)) throw new Error('Choose a valid date.');
  if (!/^\d{4}-\d{2}$/.test(p.month)) throw new Error('Choose the salary month.');
  if (PAY_TYPES.indexOf(p.type) < 0) throw new Error('Unknown payment type.');
  if (!(p.amount > 0)) throw new Error('Amount must be more than 0.');
  if (s.methods.indexOf(p.method) < 0) throw new Error('Unknown payment method: ' + p.method);
  const emp = cleanEmp_(readRow_(TABS.EMP, findRow_(TABS.EMP, p.employeeId)));

  if (req.cash) {
    const cat = readCategories_().OUT.find(c => c.toLowerCase() === 'salary') || 'Salary';
    const mon = MONTHS_[Number(p.month.slice(5, 7)) - 1];
    const txn = saveTxn_({
      date: p.date,
      type: 'OUT',
      description: emp.name.toUpperCase() + ' ' + mon + (p.type === 'ADVANCE' ? ' ADV' : ' SALARY') + ' (SALARY)',
      category: cat,
      amount: p.amount,
      method: p.method,
      note: p.note || 'From salary tracker',
    }, false);
    p.txnId = txn.id;
  }
  p.id = Utilities.getUuid();
  p.createdAt = new Date();
  sheet_(TABS.PAY).appendRow(toRow_(TABS.PAY, p));
  return { id: p.id, txnId: p.txnId };
}
const MONTHS_ = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function deleteSalaryPayment_(id) {
  const row = findRow_(TABS.PAY, id);
  const txnId = String(readRow_(TABS.PAY, row).txnId || '');
  sheet_(TABS.PAY).deleteRow(row);
  if (txnId) {
    try { deleteRowById_(TABS.TXN, txnId); } catch (e) { /* cash entry was already deleted */ }
  }
  return { deleted: true };
}

/**
 * Copies employees (and the advances already taken) from an existing
 * "Monthly Salary Sheet". Employees are matched by name and updated.
 * Advances are not added to the cash book because they are usually there already.
 */
function importSalarySheet() {
  const ui = SpreadsheetApp.getUi();
  ensureTabs_();
  const urlRes = ui.prompt('Import salary sheet', 'Paste the link of the Google Sheet that has the salary sheet:', ui.ButtonSet.OK_CANCEL);
  if (urlRes.getSelectedButton() !== ui.Button.OK) return;
  const monthRes = ui.prompt('Import salary sheet', 'Which month are the advances for? (YYYY-MM, e.g. ' + today_().slice(0, 7) + ')', ui.ButtonSet.OK_CANCEL);
  if (monthRes.getSelectedButton() !== ui.Button.OK) return;
  const month = monthRes.getResponseText().trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    ui.alert('The month must look like 2026-10. Nothing was imported.');
    return;
  }

  let found = null;
  SpreadsheetApp.openByUrl(urlRes.getResponseText().trim()).getSheets().some(sh => {
    const v = sh.getDataRange().getValues();
    const h = v.findIndex(r => r.some(c => /employee name/i.test(String(c))));
    if (h < 0) return false;
    found = { values: v, head: h };
    return true;
  });
  if (!found) {
    ui.alert('No tab with an "Employee Name" column was found in that sheet.');
    return;
  }
  const head = found.values[found.head].map(c => String(c).toLowerCase());
  const col = re => head.findIndex(c => re.test(c));
  const cName = col(/employee name/), cDes = col(/designation/), cBasic = col(/basic/), cAdv = col(/advance/);

  const people = [];
  for (let i = found.head + 1; i < found.values.length; i++) {
    const r = found.values[i];
    const name = String(r[cName]).trim();
    if (!name || /^total$/i.test(name)) continue;
    people.push({
      name: name,
      designation: cDes >= 0 ? String(r[cDes]).trim() : '',
      basicSalary: cBasic >= 0 ? num_(r[cBasic]) : 0,
      advance: cAdv >= 0 ? num_(r[cAdv]) : 0,
    });
  }
  const ok = ui.alert('Import salary sheet',
    'Found ' + people.length + ' employees. Employees with the same name are updated, others are added. ' +
    'Heads of department and investors are set to no absence deduction. ' +
    'Advances are recorded for ' + month + ' (replacing any earlier import for that month) but not added to the cash book. Continue?',
    ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;

  withLock_(() => {
    const byName = {};
    employees_().forEach(e => { byName[e.name.toLowerCase()] = e; });
    const s = readSettings_();
    const payRows = readRows_(TABS.PAY).filter(p => !(String(p.source) === 'import' && String(p.month) === month));
    const now = new Date();
    people.forEach(p => {
      const old = byName[p.name.toLowerCase()];
      const emp = saveEmployee_({
        id: old ? old.id : '',
        name: p.name,
        designation: p.designation,
        basicSalary: p.basicSalary,
        phone: old ? old.phone : '',
        joinDate: old ? old.joinDate : '',
        // Investors and heads of department are paid in full regardless of attendance.
        trackAttendance: old ? old.trackAttendance : !NO_DEDUCTION.test(p.designation),
        active: true,
      });
      if (p.advance > 0) {
        payRows.push({
          id: Utilities.getUuid(), date: month + '-01', employeeId: emp.id, month: month, type: 'ADVANCE', amount: p.advance,
          method: s.methods[0], note: 'Imported from salary sheet', txnId: '', source: 'import', createdAt: now,
        });
      }
    });
    const sh = sheet_(TABS.PAY);
    const H = TABS.PAY.headers;
    const n = sh.getLastRow();
    if (n > 1) sh.getRange(2, 1, n - 1, H.length).clearContent();
    if (payRows.length) sh.getRange(2, 1, payRows.length, H.length).setValues(payRows.map(p => toRow_(TABS.PAY, p)));
  });
  ui.alert('Imported ' + people.length + ' employees.');
}

// ───────────────────────────── Import old daily sheets ─────────────────────────────

/**
 * Reads every tab laid out like the old "DAILY CASH FLOW LEDGER" sheets and
 * copies their rows into Transactions. Running it again replaces the earlier
 * import, so it is safe to repeat.
 */
function importLegacySheets() {
  const ui = SpreadsheetApp.getUi();
  ensureTabs_();
  const ss = SpreadsheetApp.getActive();
  const tz = tz_();
  const ours = Object.keys(TABS).map(k => TABS[k].name);
  const s = readSettings_();
  const cats = readCategories_();

  const days = [];
  ss.getSheets().forEach(sh => {
    if (ours.indexOf(sh.getName()) >= 0) return;
    const v = sh.getDataRange().getValues();
    const isLedger = v.some(r => /DAILY CASH FLOW/i.test(String(r[0])));
    const headRow = v.findIndex(r => String(r[0]).trim().toUpperCase() === 'SL');
    const dateRow = v.findIndex(r => /^DATE/i.test(String(r[0]).trim()));
    if (!isLedger || headRow < 0 || dateRow < 0) return;
    const rawDate = v[dateRow].slice(1).find(c => c instanceof Date);
    if (!rawDate) return;
    const rows = [];
    for (let i = headRow + 1; i < v.length && String(v[i][0]).trim().toUpperCase() !== 'TOTAL'; i++) rows.push(v[i]);
    days.push({ sheet: sh.getName(), date: Utilities.formatDate(rawDate, tz, 'yyyy-MM-dd'), rows: rows });
  });
  if (!days.length) {
    ui.alert('No daily ledger sheets were found.');
    return;
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  const first = days[0].date;
  const last = days[days.length - 1].date;

  const methodOf = raw => {
    const r = String(raw).trim();
    if (!r) return s.methods[0];
    const hit = s.methods.find(m => m.toLowerCase() === r.toLowerCase());
    if (hit) return hit;
    s.methods.push(r);
    return r;
  };
  const categoryOf = (desc, type) => {
    const m = desc.match(/\(([^()]+)\)\s*$/);
    if (!m) return type === 'IN' ? 'Customer Payment' : 'Uncategorized';
    const raw = m[1].trim();
    const hit = cats[type].find(c => c.toLowerCase() === raw.toLowerCase());
    if (hit) return hit;
    const name = raw.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    cats[type].push(name);
    return name;
  };

  const opening = {};
  const txns = [];
  const now = new Date();
  days.forEach(d => d.rows.forEach(r => {
    [['IN', 1], ['OUT', 7]].forEach(spec => {
      const type = spec[0], c = spec[1];
      const desc = String(r[c + 1]).trim();
      const amount = Number(r[c + 2]);
      if (!(amount > 0)) return;
      const method = methodOf(r[c + 3]);
      if (type === 'IN' && /^OPENING\b/i.test(desc)) {
        // Opening balances become settings, not income. Later days' opening rows are carried forward automatically.
        if (d.date === first) opening[method] = (opening[method] || 0) + amount;
        return;
      }
      txns.push({
        id: Utilities.getUuid(), date: d.date, type: type, invoice: String(r[c]).trim(), description: desc || '(no description)',
        category: categoryOf(desc, type), amount: amount, method: method, toMethod: '', note: '',
        source: 'legacy:' + d.sheet, createdAt: now, updatedAt: now,
      });
    });
  }));

  const ok = ui.alert(
    'Import old daily sheets',
    'Found ' + days.length + ' daily sheet(s) from ' + first + ' to ' + last + ' with ' + txns.length + ' entries.\n\n' +
    'This replaces anything imported before (entries added in the app are kept) and sets the opening balances for ' + first + '. Continue?',
    ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;

  withLock_(() => {
    const H = TABS.TXN.headers;
    const sh = sheet_(TABS.TXN);
    const keep = readRows_(TABS.TXN).filter(r => String(r.source).indexOf('legacy:') !== 0);
    const rows = keep.concat(txns).map(t => toRow_(TABS.TXN, t));
    const n = sh.getLastRow();
    if (n > 1) sh.getRange(2, 1, n - 1, H.length).clearContent();
    if (rows.length) sh.getRange(2, 1, rows.length, H.length).setValues(rows);

    const settings = { startDate: first, methods: s.methods };
    Object.keys(opening).forEach(m => { settings['opening_' + m] = opening[m]; });
    saveSettings_(settings);
    saveCategories_(cats);
  });
  ui.alert('Imported ' + txns.length + ' entries from ' + days.length + ' sheet(s). Your old sheets were not changed.');
}

// ───────────────────────────── Helpers ─────────────────────────────

function sheet_(tab) {
  const sh = SpreadsheetApp.getActive().getSheetByName(tab.name);
  if (!sh) throw new Error('The "' + tab.name + '" tab is missing. In the Google Sheet, run M&M App → Set up / repair tabs.');
  return sh;
}

function readRows_(tab) {
  const sh = sheet_(tab);
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const tz = tz_();
  return sh.getRange(2, 1, n, tab.headers.length).getValues()
    .map((r, i) => {
      const o = { _row: i + 2 };
      tab.headers.forEach((h, j) => { o[h] = cell_(r[j], tz); });
      return o;
    })
    .filter(o => o[tab.headers[0]] !== '');
}

function readRow_(tab, row) {
  const tz = tz_();
  const r = sheet_(tab).getRange(row, 1, 1, tab.headers.length).getValues()[0];
  const o = { _row: row };
  tab.headers.forEach((h, j) => { o[h] = cell_(r[j], tz); });
  return o;
}

function findRow_(tab, id) {
  const sh = sheet_(tab);
  const n = sh.getLastRow() - 1;
  if (id && n > 0) {
    const ids = sh.getRange(2, 1, n, 1).getValues();
    for (let i = 0; i < n; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  }
  throw new Error('That record was not found. It may have been deleted; refresh and try again.');
}

function deleteRowById_(tab, id) {
  sheet_(tab).deleteRow(findRow_(tab, id));
  return { deleted: true };
}

function toRow_(tab, obj) {
  return tab.headers.map(h => safe_(obj[h], h));
}

/** Keeps text as text: stops Sheets turning "1/2" into a date or "=..." into a formula. */
function safe_(v, field) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string' || DATE_FIELDS.indexOf(field) >= 0) return v;
  return v === '' ? v : "'" + v;
}

function cell_(v, tz) {
  if (v instanceof Date) {
    const t = Utilities.formatDate(v, tz, "yyyy-MM-dd'T'HH:mm:ss");
    return t.slice(10) === 'T00:00:00' ? t.slice(0, 10) : t;
  }
  return v;
}

function str_(v, max) {
  return String(v === undefined || v === null ? '' : v).trim().slice(0, max);
}

function num_(v) {
  const n = Number(v);
  return isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function isDate_(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}

function today_() {
  return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
}

function tz_() {
  return SpreadsheetApp.getActive().getSpreadsheetTimeZone();
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function codeError_(message, code) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
