import { call } from '../api.js';
import { categories, methodLabel, methods } from '../state.js';
import { esc, formError, openModal, options, submitting, toast } from '../util.js';

const TITLES = { IN: 'Cash in', OUT: 'Cash out', TRANSFER: 'Move money between accounts' };

/** Add or edit one cash-book entry. Calls onSaved() after every successful save. */
export function openTxnForm({ type, date, txn, onSaved }) {
  const editing = !!txn;
  type = txn?.type || type;
  const ms = methods();
  const cats = [...categories(type)];
  const t = txn || { date, type, method: ms[0], toMethod: ms[1] || ms[0], category: type === 'IN' ? cats[0] : '' };
  if (t.category && type !== 'TRANSFER' && !cats.includes(t.category)) cats.push(t.category);

  const methodField = type === 'TRANSFER'
    ? `<div class="grid2">
        <label>From<select name="method">${options(ms, t.method, methodLabel)}</select></label>
        <label>To<select name="toMethod">${options(ms, t.toMethod, methodLabel)}</select></label>
      </div>`
    : `<label>${type === 'IN' ? 'Received in' : 'Paid from'}<select name="method">${options(ms, t.method, methodLabel)}</select></label>`;

  const m = openModal({
    title: `${editing ? 'Edit' : 'New'}: ${TITLES[type]}`,
    body: `
      <form class="form" novalidate>
        ${type === 'TRANSFER' ? '' : `
          <label>${type === 'IN' ? 'Customer / description' : 'Description'}
            <input name="description" maxlength="200" required autofocus value="${esc(t.description || '')}"
              placeholder="${type === 'IN' ? 'e.g. Customer name' : 'e.g. Lunch for staff'}">
          </label>`}
        <div class="grid2">
          <label>Amount (৳)<input name="amount" type="number" inputmode="decimal" min="0" step="0.01" required value="${esc(t.amount ?? '')}" ${type === 'TRANSFER' ? 'autofocus' : ''}></label>
          ${type === 'TRANSFER' ? '' : `
            <label>Category
              <select name="category" required>
                ${type === 'OUT' ? `<option value="" ${t.category ? '' : 'selected'} disabled>Choose…</option>` : ''}
                ${options(cats, t.category)}
              </select>
            </label>`}
        </div>
        ${methodField}
        <div class="grid2">
          <label>Date<input type="date" name="date" required value="${esc(t.date)}"></label>
          ${type === 'TRANSFER' ? '' : `<label>Invoice no. (optional)<input name="invoice" maxlength="40" value="${esc(t.invoice || '')}"></label>`}
        </div>
        <label>Note (optional)<textarea name="note" rows="2" maxlength="300">${esc(t.note || '')}</textarea></label>
        <p class="form-error" hidden></p>
        <div class="actions">
          ${editing ? '' : '<button type="submit" class="btn" data-again>Save &amp; add another</button>'}
          <button type="submit" class="btn primary">Save</button>
        </div>
      </form>`,
  });

  const form = m.el.querySelector('form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const again = !!e.submitter?.hasAttribute('data-again');
    const v = Object.fromEntries(new FormData(form));
    const amount = Number(v.amount);
    if (!v.date) return formError(form, 'Choose a date.');
    if (!(amount > 0)) return formError(form, 'Enter an amount greater than 0.');
    if (type !== 'TRANSFER' && !v.description?.trim()) return formError(form, 'Enter a description.');
    if (type === 'OUT' && !v.category) return formError(form, 'Choose a category.');
    if (type === 'TRANSFER' && v.method === v.toMethod) return formError(form, 'Choose two different accounts.');

    const payload = { ...t, ...v, type, amount };
    const saved = await submitting(form, () => call(editing ? 'updateTxn' : 'addTxn', { txn: payload }));
    if (!saved) return;
    toast(editing ? 'Entry updated' : 'Entry saved');
    onSaved?.();
    if (!again) return m.close();
    ['amount', 'description', 'invoice', 'note'].forEach(n => { if (form.elements[n]) form.elements[n].value = ''; });
    if (type === 'OUT') form.elements.category.value = '';
    (form.elements.description || form.elements.amount).focus();
  });
}
