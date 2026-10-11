import { hasSession } from './api.js';
import { state } from './state.js';
import { esc, openModal, todayISO } from './util.js';
import { openTxnForm } from './views/txnForm.js';

const go = hash => () => { location.hash = hash; };
const add = type => () => openTxnForm({ type, date: todayISO(), onSaved: () => window.dispatchEvent(new Event('mm:refresh')) });

/** Every command in the app. `keys` are single keys pressed outside text fields; "Mod" is ⌘ on Mac, Ctrl elsewhere. */
export const SHORTCUTS = [
  { id: 'menu', label: 'Open command menu', keys: ['Mod', 'K'], showOnOverview: true, run: () => openCommandMenu() },
  { id: 'in', label: 'New cash in', keys: ['I'], showOnOverview: true, run: add('IN') },
  { id: 'out', label: 'New cash out', keys: ['O'], showOnOverview: true, run: add('OUT') },
  { id: 'transfer', label: 'Move money between accounts', keys: ['T'], run: add('TRANSFER') },
  { id: 'overview', label: 'Go to Overview', keys: ['G', 'H'], run: go('#/overview') },
  { id: 'day', label: 'Go to Daily ledger', keys: ['G', 'D'], showOnOverview: true, run: go('#/day') },
  { id: 'month', label: 'Go to Monthly report', keys: ['G', 'M'], run: go('#/month') },
  { id: 'inventory', label: 'Go to Inventory', keys: ['G', 'I'], run: go('#/inventory') },
  { id: 'attendance', label: 'Go to Attendance', keys: ['G', 'A'], showOnOverview: true, run: go('#/salary/attendance') },
  { id: 'sheet', label: 'Go to Salary sheet', keys: ['G', 'S'], run: go('#/salary/sheet') },
  { id: 'employees', label: 'Go to Employees', keys: ['G', 'E'], run: go('#/salary/employees') },
  { id: 'settings', label: 'Go to Settings', keys: ['G', ','], run: go('#/settings') },
];

export const modKey = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl');

export function runShortcut(id) {
  SHORTCUTS.find(s => s.id === id)?.run();
}

const ready = () => hasSession() && !!state.meta;
const typing = el => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

export function installShortcuts() {
  let pendingG = 0;
  document.addEventListener('keydown', e => {
    if (!ready()) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (!document.querySelector('.cmdk')) openCommandMenu();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || document.querySelector('.modal-backdrop')) return;
    const key = e.key.toUpperCase();
    if (Date.now() - pendingG < 1200) {
      pendingG = 0;
      const hit = SHORTCUTS.find(s => s.keys.length === 2 && s.keys[0] === 'G' && s.keys[1] === key);
      if (hit) {
        e.preventDefault();
        hit.run();
      }
      return;
    }
    if (key === 'G') {
      pendingG = Date.now();
      return;
    }
    const hit = SHORTCUTS.find(s => s.keys.length === 1 && s.keys[0] === key);
    if (hit) {
      e.preventDefault();
      hit.run();
    }
  });
}

/** ⌘K menu: type to filter, ↑/↓ to move, Enter to run. */
export function openCommandMenu() {
  if (!ready()) return;
  const m = openModal({
    title: 'Command menu',
    body: `
      <div class="cmdk">
        <input type="text" class="cmdk-input" placeholder="Type a command or page…" aria-label="Search commands" autofocus autocomplete="off">
        <ul class="cmdk-list" role="listbox"></ul>
      </div>`,
  });
  m.el.querySelector('.modal').classList.add('cmdk-modal');
  const input = m.el.querySelector('.cmdk-input');
  const list = m.el.querySelector('.cmdk-list');
  const all = SHORTCUTS.filter(s => s.id !== 'menu');
  let shown = all;
  let active = 0;
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    shown = all.filter(s => s.label.toLowerCase().includes(q));
    active = Math.min(active, Math.max(shown.length - 1, 0));
    list.innerHTML = shown.length ? shown.map((s, i) => `
      <li role="option" aria-selected="${i === active}" data-i="${i}" class="${i === active ? 'active' : ''}">
        <span>${esc(s.label)}</span>
        <span class="keys">${s.keys.map(k => `<kbd>${esc(k)}</kbd>`).join('')}</span>
      </li>`).join('') : '<li class="cmdk-empty">No matching command</li>';
  };
  const run = i => {
    const s = shown[i];
    if (!s) return;
    m.close();
    s.run();
  };
  input.oninput = () => { active = 0; draw(); };
  input.onkeydown = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, shown.length - 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(active); }
  };
  list.onclick = e => {
    const li = e.target.closest('[data-i]');
    if (li) run(Number(li.dataset.i));
  };
  draw();
}
