import { call, defaultApiUrl, getSession, saveSession } from '../api.js';
import { esc, formError, submitting } from '../util.js';

// The demo is only offered when running on this computer, not on the public site.
const LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

export function renderLogin(view, onDone) {
  const previous = getSession();
  const url = defaultApiUrl || (previous && previous.url !== 'demo' ? previous.url : '');
  view.innerHTML = `
    <section class="login">
      <div class="login-card">
        <img src="assets/logo.png" alt="M&amp;M Car Clinic logo" class="login-logo" width="120" height="120">
        <h1>M&amp;M Car Clinic</h1>
        <p class="muted">Cash book · Inventory · Salary</p>
        <form class="form" novalidate>
          <label ${defaultApiUrl ? 'hidden' : ''}>Server URL
            <input name="url" type="url" inputmode="url" autocomplete="off" value="${esc(url)}"
              placeholder="https://script.google.com/macros/s/…/exec">
          </label>
          <label>Password
            <input name="pin" type="password" autocomplete="current-password" required>
          </label>
          <label class="check"><input type="checkbox" name="remember" checked> Keep me signed in on this device</label>
          <p class="form-error" hidden></p>
          <button class="btn primary block">Sign in</button>
        </form>
        ${LOCAL ? '<p class="muted small">No server set up yet? <button type="button" class="link" id="demo">Try the demo</button> with sample data.</p>' : ''}
      </div>
    </section>`;

  const form = view.querySelector('form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(form));
    const session = { url: (v.url || '').trim(), pin: v.pin };
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(session.url)) {
      return formError(form, 'Paste the Web app URL from Apps Script. It ends in /exec.');
    }
    if (!session.pin) return formError(form, 'Enter your password.');
    await submitting(form, async () => {
      await call('ping', {}, session);
      saveSession(session, !!v.remember);
      onDone();
    });
  });

  view.querySelector('#demo')?.addEventListener('click', () => {
    saveSession({ url: 'demo', pin: '' }, false);
    onDone();
  });
}
