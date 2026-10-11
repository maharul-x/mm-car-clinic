import { clearSession, hasSession, isDemo } from './api.js';
import { loadMeta, state } from './state.js';
import { esc, loading } from './util.js';
import { renderDay } from './views/day.js';
import { renderInventory } from './views/inventory.js';
import { renderLogin } from './views/login.js';
import { renderMonth } from './views/month.js';
import { renderSalary } from './views/salary.js';
import { renderSettings } from './views/settings.js';

const ROUTES = { day: renderDay, month: renderMonth, inventory: renderInventory, salary: renderSalary, settings: renderSettings };

const view = document.getElementById('view');
const topbar = document.getElementById('topbar');
let renderId = 0;

async function route() {
  const id = ++renderId;
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  view.onclick = null;

  if (!hasSession()) {
    topbar.hidden = true;
    document.body.classList.remove('demo');
    return renderLogin(view, () => { state.meta = null; route(); });
  }
  topbar.hidden = false;
  document.body.classList.toggle('demo', isDemo());

  const page = ROUTES[name] ? name : 'day';
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
    await ROUTES[page](view, arg);
  } catch (err) {
    if (id !== renderId) return;
    if (err.code === 'AUTH') {
      clearSession();
      state.meta = null;
      return route();
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

window.addEventListener('hashchange', route);
route();
