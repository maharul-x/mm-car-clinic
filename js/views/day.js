import { call } from '../api.js';
import { methodLabel, methods, settings } from '../state.js';
import { addDays, applyTxn, confirmDialog, esc, fmt, isISO, loading, prettyDate, sum, taka, toast, todayISO } from '../util.js';
import { openTxnForm } from './txnForm.js';

export async function renderDay(view, arg) {
  const date = isISO(arg) ? arg : todayISO();
  view.innerHTML = loading();
  const { opening, txns } = await call('range', { from: date, to: date });
  const s = settings();
  const ms = methods();

  const ins = txns.filter(t => t.type === 'IN');
  const outs = txns.filter(t => t.type === 'OUT');
  const transfers = txns.filter(t => t.type === 'TRANSFER');
  const closing = { ...opening };
  txns.forEach(t => applyTxn(closing, t));
  const openTotal = sum(Object.values(opening));
  const totalIn = sum(ins.map(t => t.amount));
  const totalOut = sum(outs.map(t => t.amount));
  const closeTotal = openTotal + totalIn - totalOut;
  const longDate = prettyDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  view.innerHTML = `
    <section class="page day">
      <header class="print-only print-head">
        <img src="assets/logo.png" alt="" width="64" height="64">
        <div>
          <h1>${esc(s.businessName)}</h1>
          <p>${esc(s.address)}</p>
          <h2>Daily Cash Flow Ledger · ${esc(longDate)}</h2>
        </div>
      </header>

      <div class="toolbar no-print">
        <div class="datenav">
          <a class="btn icon" href="#/day/${addDays(date, -1)}" aria-label="Previous day">‹</a>
          <input type="date" id="pick" value="${date}" aria-label="Choose date">
          <a class="btn icon" href="#/day/${addDays(date, 1)}" aria-label="Next day">›</a>
          ${date !== todayISO() ? `<a class="btn ghost" href="#/day/${todayISO()}">Today</a>` : ''}
        </div>
        <div class="toolbar-actions">
          <button class="btn in" data-add="IN">+ Cash in</button>
          <button class="btn out" data-add="OUT">− Cash out</button>
          <button class="btn" data-add="TRANSFER">⇄ Transfer</button>
          <button class="btn ghost" id="print">Print</button>
        </div>
      </div>

      <h1 class="page-title no-print">${esc(longDate)}</h1>

      <div class="cards">
        ${card('Opening balance', openTotal)}
        ${card('Cash in', totalIn, 'in', `${ins.length} entr${ins.length === 1 ? 'y' : 'ies'}`)}
        ${card('Cash out', totalOut, 'out', `${outs.length} entr${outs.length === 1 ? 'y' : 'ies'}`)}
        ${card('Closing balance', closeTotal, 'total', `Net ${totalIn - totalOut < 0 ? '−' : '+'}${taka(Math.abs(totalIn - totalOut))}`)}
      </div>

      <div class="panel methods">
        <h2>Closing balance by account</h2>
        <div class="method-grid">
          ${ms.map(m => `
            <div class="method">
              <span>${esc(methodLabel(m))}</span>
              <strong class="${closing[m] < 0 ? 'neg' : ''}">${taka(closing[m])}</strong>
              <small>Opened at ${taka(opening[m])}</small>
            </div>`).join('')}
        </div>
      </div>

      <div class="ledger">
        ${ledgerTable('Cash in', ins, totalIn, 'in')}
        ${ledgerTable('Cash out', outs, totalOut, 'out')}
      </div>

      ${transfers.length ? `
        <div class="panel">
          <h2>Transfers between accounts</h2>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>From</th><th>To</th><th>Note</th><th class="num">Amount</th><th class="no-print"><span class="sr">Actions</span></th></tr></thead>
            <tbody>${transfers.map(t => `
              <tr>
                <td>${esc(methodLabel(t.method))}</td><td>${esc(methodLabel(t.toMethod))}</td>
                <td>${esc(t.note || t.description)}</td><td class="num">${fmt(t.amount)}</td>
                ${rowActions(t)}
              </tr>`).join('')}</tbody>
          </table></div>
        </div>` : ''}

      <div class="print-only print-summary">
        <table class="table">
          <tbody>
            <tr><th colspan="2">Daily summary</th></tr>
            <tr><td>Opening balance</td><td class="num">${fmt(openTotal)}</td></tr>
            <tr><td>(+) Total cash in</td><td class="num">${fmt(totalIn)}</td></tr>
            <tr><td>(−) Total cash out</td><td class="num">${fmt(totalOut)}</td></tr>
            <tr><td>Net cash flow</td><td class="num">${fmt(totalIn - totalOut)}</td></tr>
            <tr><td><strong>Closing balance</strong></td><td class="num"><strong>${fmt(closeTotal)}</strong></td></tr>
            <tr><th colspan="2">Closing balance represented by</th></tr>
            ${ms.map(m => `<tr><td>${esc(methodLabel(m))}</td><td class="num">${fmt(closing[m])}</td></tr>`).join('')}
          </tbody>
        </table>
        <div class="signatures">
          <span>Prepared by: ${esc(s.preparedBy)}</span>
          <span>Verified by: ______________________</span>
        </div>
      </div>
    </section>`;

  const byId = new Map(txns.map(t => [t.id, t]));
  const refresh = () => renderDay(view, date);

  view.querySelector('#pick').onchange = e => {
    if (isISO(e.target.value)) location.hash = `#/day/${e.target.value}`;
  };
  view.querySelector('#print').onclick = () => window.print();
  view.querySelectorAll('[data-add]').forEach(b => {
    b.onclick = () => openTxnForm({ type: b.dataset.add, date, onSaved: refresh });
  });
  view.onclick = async e => {
    const edit = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-del]');
    if (edit) openTxnForm({ txn: byId.get(edit.dataset.edit), onSaved: refresh });
    if (del) {
      const t = byId.get(del.dataset.del);
      const ok = await confirmDialog(`Delete "${t.description}" (${taka(t.amount)})? This cannot be undone.`);
      if (!ok) return;
      try {
        await call('deleteTxn', { id: t.id });
        toast('Entry deleted');
        refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  };
}

function card(label, value, kind = '', sub = '') {
  return `<div class="card ${kind}"><span>${label}</span><strong>${taka(value)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
}

function rowActions(t) {
  return `<td class="row-actions no-print">
    <button class="link" data-edit="${esc(t.id)}">Edit</button>
    <button class="link danger" data-del="${esc(t.id)}">Delete</button>
  </td>`;
}

function ledgerTable(title, rows, total, kind) {
  return `
    <div class="panel ${kind}">
      <h2>${title}</h2>
      ${rows.length ? `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>SL</th><th>Inv. no.</th><th>Description</th><th>Method</th><th class="num">Amount (৳)</th><th class="no-print"><span class="sr">Actions</span></th></tr></thead>
          <tbody>${rows.map((t, i) => `
            <tr>
              <td>${i + 1}</td>
              <td class="nowrap">${esc(t.invoice)}</td>
              <td>${esc(t.description)}
                <span class="chip${t.category === 'Uncategorized' ? ' warn' : ''}">${esc(t.category)}</span>
                ${t.note ? `<small class="note">${esc(t.note)}</small>` : ''}
              </td>
              <td>${esc(methodLabel(t.method))}</td>
              <td class="num">${fmt(t.amount)}</td>
              ${rowActions(t)}
            </tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="4">Total</td><td class="num">${fmt(total)}</td><td class="no-print"></td></tr></tfoot>
        </table></div>`
      : `<p class="empty">No ${title.toLowerCase()} entries for this day.</p>`}
    </div>`;
}
