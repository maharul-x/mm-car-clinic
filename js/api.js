import { API_URL } from './config.js';
import { mockCall } from './mock.js';

const KEY = 'mm.session';

export const defaultApiUrl = API_URL;

export class ApiError extends Error {
  constructor(message, code = '') {
    super(message);
    this.code = code;
  }
}

export function getSession() {
  for (const store of [localStorage, sessionStorage]) {
    try {
      const s = JSON.parse(store.getItem(KEY) || 'null');
      if (s && s.url) return s;
    } catch { /* storage blocked */ }
  }
  return null;
}

export function saveSession(session, remember) {
  clearSession();
  try {
    (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(session));
  } catch { /* storage blocked: session lasts until reload */ }
  memory = session;
}

export function clearSession() {
  memory = null;
  for (const store of [localStorage, sessionStorage]) {
    try { store.removeItem(KEY); } catch { /* ignore */ }
  }
}

let memory = null;
export const hasSession = () => !!(memory || getSession());
export const isDemo = () => (memory || getSession())?.url === 'demo';

export async function call(action, params = {}, session = memory || getSession()) {
  if (!session) throw new ApiError('Please sign in.', 'AUTH');
  if (session.url === 'demo') {
    try {
      return await mockCall(action, params);
    } catch (e) {
      throw new ApiError(e.message);
    }
  }
  let res;
  try {
    res = await fetch(session.url, {
      method: 'POST',
      // text/plain avoids a CORS preflight, which Apps Script cannot answer.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...params, action, pin: session.pin }),
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your internet connection.', 'NETWORK');
  }
  let body;
  try {
    body = await res.json();
  } catch {
    throw new ApiError('The server sent an unexpected reply. Check the server URL.', 'BAD_RESPONSE');
  }
  if (!body.ok) throw new ApiError(body.error || 'Request failed.', body.code);
  return body.data;
}
