(() => {
  'use strict';

  const STORAGE_KEY = 'instant_admirers_theme';
  const DARK = 'dark';
  const LIGHT = 'light';
  const root = document.documentElement;

  function savedTheme() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === LIGHT || value === DARK ? value : DARK;
    } catch (_) {
      return DARK;
    }
  }

  function labels(theme) {
    const english = String(document.documentElement.lang || '').toLowerCase().startsWith('en');
    if (theme === LIGHT) {
      return english
        ? { icon: '🌙', text: 'Dark', aria: 'Switch to dark mode' }
        : { icon: '🌙', text: 'Oscuro', aria: 'Activar modo oscuro' };
    }
    return english
      ? { icon: '☀️', text: 'Light', aria: 'Switch to light mode' }
      : { icon: '☀️', text: 'Claro', aria: 'Activar modo claro' };
  }

  function updateMeta(theme) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head?.appendChild(meta);
    }
    meta.content = theme === LIGHT ? '#f7f8fc' : '#0b0b12';

    let scheme = document.querySelector('meta[name="color-scheme"]');
    if (!scheme) {
      scheme = document.createElement('meta');
      scheme.name = 'color-scheme';
      document.head?.appendChild(scheme);
    }
    scheme.content = theme === LIGHT ? 'light' : 'dark';
  }

  function updateButton(theme) {
    const button = document.getElementById('ia-theme-toggle');
    if (!button) return;
    const copy = labels(theme);
    button.dataset.currentTheme = theme;
    button.setAttribute('aria-label', copy.aria);
    button.setAttribute('title', copy.aria);
    const icon = button.querySelector('.ia-theme-toggle-icon');
    const text = button.querySelector('.ia-theme-toggle-text');
    if (icon) icon.textContent = copy.icon;
    if (text) text.textContent = copy.text;
  }

  function apply(theme, persist = false) {
    const next = theme === LIGHT ? LIGHT : DARK;
    root.dataset.theme = next;
    root.style.colorScheme = next;
    updateMeta(next);
    updateButton(next);
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, next); } catch (_) {}
    }
    try { window.dispatchEvent(new CustomEvent('ia:themechange', { detail: { theme: next } })); } catch (_) {}
    return next;
  }

  function toggle() {
    return apply(root.dataset.theme === LIGHT ? DARK : LIGHT, true);
  }

  function mountToggle() {
    if (!document.body || document.getElementById('ia-theme-toggle')) return;
    const button = document.createElement('button');
    button.id = 'ia-theme-toggle';
    button.className = 'ia-theme-toggle';
    button.type = 'button';
    button.innerHTML = '<span class="ia-theme-toggle-icon" aria-hidden="true"></span><span class="ia-theme-toggle-text"></span>';
    button.addEventListener('click', toggle);
    document.body.appendChild(button);
    updateButton(root.dataset.theme || DARK);
  }

  apply(savedTheme(), false);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountToggle, { once: true });
  else mountToggle();

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    apply(event.newValue === LIGHT ? LIGHT : DARK, false);
  });

  window.IATheme = Object.freeze({
    get: () => root.dataset.theme || DARK,
    set: (theme) => apply(theme, true),
    toggle
  });
})();
