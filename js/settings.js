/* =====================================================================
   settings.js: user preferences (text zoom + colour theme).
   Stored in localStorage only: no server, no login. These keys must match
   the tiny inline script in index.html's <head>, which applies them before
   first paint so the page never flashes the wrong theme.
   ===================================================================== */
import { announce } from './render.js';

const KEY_ZOOM  = 'pageScale';
const KEY_THEME = 'theme';

// Fixed steps, not free-form: predictable jumps and a hard limit, so the
// page can never be zoomed into something unusable.
const ZOOM_STEPS = [1, 1.25, 1.5, 1.75, 2];
const THEMES     = ['standard', 'high-contrast'];

const root = document.documentElement;      // <html>: where the CSS variables live
let pageScale = 1;
let theme = 'standard';

// localStorage can THROW (private browsing, blocked cookies). Every access
// is wrapped, and the app simply falls back to defaults.
function load(key) { try { return localStorage.getItem(key); } catch { return null; } }
function save(key, value) { try { localStorage.setItem(key, String(value)); } catch { /* ignore */ } }

/* ---------- Zoom ---------- */
// applyZoom changes the page. setZoom also remembers the choice.
function applyZoom(scale) {
  pageScale = scale;
  // One variable change: html { font-size: calc(100% * var(--zoom)) } plus
  // all-rem sizing means everything scales together and re-wraps.
  root.style.setProperty('--zoom', scale);
}
export function setZoom(scale) {
  if (!ZOOM_STEPS.includes(scale)) return;   // whitelist: ignore anything unexpected
  applyZoom(scale);
  save(KEY_ZOOM, scale);
}

/** direction: +1 (zoom in) or -1 (zoom out). Buttons AND voice will both call this. */
export function changeZoom(direction) {
  const i = ZOOM_STEPS.indexOf(pageScale);
  const next = ZOOM_STEPS[Math.min(Math.max(i + direction, 0), ZOOM_STEPS.length - 1)];
  if (next === pageScale) {
    announce(direction > 0 ? 'Already at the largest size.' : 'Already at the smallest size.');
    return;
  }
  setZoom(next);
  announce(`Zoom ${Math.round(next * 100)} percent.`);
}

/* ---------- Theme ---------- */
function applyTheme(name) {
  theme = name;
  root.dataset.theme = name;                 // CSS reacts via :root[data-theme="..."]
}
export function setTheme(name) {
  if (!THEMES.includes(name)) return;
  applyTheme(name);
  save(KEY_THEME, name);
}

/* ---------- Start-up and the settings dialog ---------- */
export function initSettings() {
  // Re-apply saved values (the inline <head> script already did, but this
  // keeps this module's own variables in sync). Validate before trusting.
  const savedZoom  = parseFloat(load(KEY_ZOOM));
  const savedTheme = load(KEY_THEME);
  applyZoom(ZOOM_STEPS.includes(savedZoom) ? savedZoom : 1);
  applyTheme(THEMES.includes(savedTheme) ? savedTheme : 'standard');

  const dialog = document.getElementById('settings-dialog');
  const form   = document.getElementById('settings-form');

  // Tick the radio buttons that match the CURRENT settings each time it opens.
  function syncForm() {
    for (const radio of form.elements.zoom)  radio.checked = parseFloat(radio.value) === pageScale;
    for (const radio of form.elements.theme) radio.checked = radio.value === theme;
  }

  document.getElementById('btn-settings').addEventListener('click', () => {
    syncForm();
    dialog.showModal();   // native modal: focus trap, Esc to close, backdrop
  });

  // ONE delegated listener for all 7 radios. Changes apply instantly
  // (live preview), so the user sees the effect without pressing "Done".
  form.addEventListener('change', (event) => {
    const input = event.target;
    if (input.name === 'zoom')  setZoom(parseFloat(input.value));
    if (input.name === 'theme') setTheme(input.value);
  });
  // "Done" is a method="dialog" submit button, so the browser closes it for us.
}