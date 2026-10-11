import { clearSession, hasSession, isDemo, signOut } from './api.js';
import { can, isAdmin, loadMeta, state } from './state.js';
import { esc, guard, loading } from './util.js';
import { renderDay } from './views/day.js';
import { renderInventory } from './views/inventory.js';
import { renderLogin } from './views/login.js';
import { renderMonth } from './views/month.js';
import { renderOverview } from './views/overview.js';
import { installShortcuts, modKey, openCommandMenu } from './shortcuts.js';
import { applyTheme, cycleTheme } from './theme.js';
import { renderSalary } from './views/salary.js';
import { renderSettings } from './views/settings.js';
import { renderUsers } from './views/users.js';
import { renderActivity } from './views/activity.js';

const ROUTES = {
  overview: renderOverview, day: renderDay, month: renderMonth, inventory: renderInventory, salary: renderSalary,
  settings: renderSettings, users: renderUsers, activity: renderActivity,
};
// Who may open each page. The server enforces the same rules on every request; this only hides what you can't use.
const ACCESS = {
  overview: () => true,
  day: () => can('cash'),
  month: () => can('report'),
  inventory: () => can('inventory'),
  salary: () => can(['attendance', 'salary', 'employees']),
  settings: () => true,
  users: isAdmin,
  activity: isAdmin,
};

const view = document.getElementById('view');
const topbar = document.getElementById('topbar');
let renderId = 0;
let currentHash = location.hash;
let restoring = false;

window.addEventListener('beforeunload', e => {
  if (guard.message) e.preventDefault();
});

async function route() {
  if (restoring) {
    restoring = false;
    return;
  }
  if (guard.message && location.hash !== currentHash) {
    if (!window.confirm(guard.message)) {
      restoring = true;
      location.hash = currentHash;
      return;
    }
  }
  guard.message = null;
  currentHash = location.hash;
  const id = ++renderId;
  const [name, ...args] = location.hash.replace(/^#\/?/, '').split('/');
  view.onclick = null;

  if (!hasSession()) {
    topbar.hidden = true;
    document.body.classList.remove('demo');
    state.meta = null;
    state.user = null;
    return renderLogin(view, () => { state.meta = null; route(); });
  }
  topbar.hidden = false;
  document.body.classList.toggle('demo', isDemo());

  const page = ROUTES[name] ? name : 'overview';
  topbar.querySelectorAll('[data-route]').forEach(a => {
    if (a.dataset.route === page) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  try {
    if (!state.meta) {
      view.innerHTML = loading('Connecting…');
      await loadMeta();
    }
    if (id !== renderId) return;
    drawNav();
    if (!ACCESS[page]()) return noAccess();
    await ROUTES[page](view, ...args);
  } catch (err) {
    if (id !== renderId) return;
    if (err.code === 'AUTH') {
      clearSession();
      state.meta = null;
      return route();
    }
    if (err.code === 'FORBIDDEN') {
      // Permissions changed while signed in: reload them and redraw.
      state.meta = null;
      return noAccess(err.message);
    }
    view.innerHTML = `
      <section class="page">
        <div class="panel error-box">
          <h2>Something went wrong</h2>
          <p>${esc(err.message)}</p>
          <button class="btn primary" id="retry">Try again</button>
        </div>
      </section>`;
    view.querySelector('#retry').onclick = () => { state.meta = null; route(); };
  }
}

function noAccess(message = 'You don’t have access to this page. Ask the admin if you need it.') {
  view.innerHTML = `
    <section class="page">
      <div class="panel">
        <p class="eyebrow">No access</p>
        <p>${esc(message)}</p>
        <a class="btn" href="#/overview">Go to Overview</a>
      </div>
    </section>`;
}

/** Shows only the pages this user can open, plus who is signed in. */
function drawNav() {
  topbar.querySelectorAll('[data-route]').forEach(a => { a.hidden = !ACCESS[a.dataset.route](); });
  const u = state.user;
  const who = document.getElementById('whoami');
  who.hidden = !u;
  if (u) {
    who.querySelector('.who-name').textContent = u.name || u.username;
    who.querySelector('.who-role').textContent = isDemo() ? 'Demo' : u.isAdmin ? 'Admin' : `@${u.username}`;
    who.querySelector('.avatar').textContent = (u.name || u.username || '?').trim().charAt(0).toUpperCase();
  }
}

document.getElementById('signout').onclick = async () => {
  if (guard.message && !window.confirm(guard.message)) return;
  guard.message = null;
  await signOut();
  location.hash = '#/overview';
  route();
};

window.addEventListener('hashchange', route);
// Re-draw the current screen after a save made from a shortcut or the command menu.
window.addEventListener('mm:refresh', route);
installShortcuts();
applyTheme();
document.getElementById('theme-toggle').onclick = cycleTheme;
document.getElementById('cmdk-open').onclick = openCommandMenu;
document.getElementById('cmdk-mod').textContent = modKey();
route();
