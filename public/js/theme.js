// theme.js — dark / light / system theme and accent palette on <html>.

import { THEMES } from './calc.js';

const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

export function effectiveTheme(theme) {
  if (theme === 'dark' || theme === 'light') return theme;
  return media && media.matches ? 'dark' : 'light';
}

export function applyTheme(theme, accent) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = theme;
  root.dataset.accent = accent;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    if (bg) meta.setAttribute('content', bg);
  }
}

export function nextTheme(theme) {
  const i = THEMES.indexOf(theme);
  // dark → light → system → dark
  const order = ['dark', 'light', 'system'];
  const j = order.indexOf(theme);
  return order[(j + 1) % order.length] || THEMES[(i + 1) % THEMES.length];
}

export function watchSystemTheme(cb) {
  if (!media) return () => {};
  const fn = () => cb(media.matches ? 'dark' : 'light');
  media.addEventListener('change', fn);
  return () => media.removeEventListener('change', fn);
}
