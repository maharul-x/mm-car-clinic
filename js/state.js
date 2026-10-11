import { call } from './api.js';

export const state = { meta: null };

export async function loadMeta() {
  state.meta = await call('meta');
  return state.meta;
}

export const settings = () => state.meta.settings;
export const methods = () => state.meta.settings.methods;
export const categories = type => state.meta.categories[type] || [];
export const methodLabel = m => (m === 'Cash' ? 'Cash in hand' : m === 'Bkash' ? 'bKash' : m);
