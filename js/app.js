/* =====================================================================
   app.js: the conductor. It owns the STATE and wires events to actions.
   Pattern: user does something -> an action changes `state` -> render
   functions draw it. Buttons today, voice commands in Stage 3c: both will
   call the SAME actions, so they can never disagree.
   ===================================================================== */
import * as api from './api.js';
import * as render from './render.js';
import { initSettings } from './settings.js';

const $ = (id) => document.getElementById(id);

// The single source of truth. (Zoom and theme live in settings.js.)
const state = {
  view: 'home',     // 'home' | 'guide' | 'magnifier'
  services: [],
  guide: null,      // the service being read
  steps: [],        // ordered array from steps.php
  stepIndex: 0,     // array traversal: which element is showing
  loading: false,   // blocks double-taps while a request is running
};

/* ---------- Drawing helpers ---------- */
function setView(view) {
  state.view = view;
  render.showView(view);
  render.updateNav(view, state.stepIndex, state.steps.length);
}

function showStep({ announceStep = true } = {}) {
  const total = state.steps.length;
  const step = state.steps[state.stepIndex];
  render.renderStep(step, state.stepIndex, total);
  render.updateNav(state.view, state.stepIndex, total);
  if (announceStep) {
    // Screen-reader users hear the whole step, not just "button pressed".
    render.announce(`Step ${state.stepIndex + 1} of ${total}. ${step.instruction_text}`);
  }
}

/* ---------- Actions ---------- */
async function loadServices() {
  render.showHomeStatus('Loading your guides…');
  try {
    state.services = await api.getServices();
    if (state.services.length === 0) {
      render.showHomeStatus('No guides are available yet.');
      return;
    }
    render.renderServices(state.services);
    render.hideHomeStatus();
  } catch (error) {
    render.showHomeStatus(error.message, { retry: true });
  }
}

async function openGuide(slug) {
  if (state.loading) return;
  state.loading = true;
  render.showHomeStatus('Opening your guide…');
  try {
    // Promise.all fires BOTH requests at once, so the wait is the slower of
    // the two instead of the sum. Tariffs are optional: if they fail, the
    // guide still opens (catch -> empty list).
    const [guide, tariffs] = await Promise.all([
      api.getGuide(slug),
      api.getTariffs(slug).catch(() => []),
    ]);
    if (guide.steps.length === 0) throw new Error('This guide has no steps yet.');

    state.guide = guide.service;
    state.steps = guide.steps;
    state.stepIndex = 0;

    render.showGuideHeader(guide.service);
    render.renderTariffs(tariffs);
    render.hideHomeStatus();
    setView('guide');                    // focus moves to the guide title...
    showStep({ announceStep: false });   // ...so don't also announce step 1 (double speech)
  } catch (error) {
    render.showHomeStatus(error.message);
  } finally {
    state.loading = false;
  }
}

function goHome() {
  state.guide = null;
  state.steps = [];
  state.stepIndex = 0;
  setView('home');
}

function goNext() {
  if (state.view !== 'guide') return;
  if (state.stepIndex < state.steps.length - 1) {
    state.stepIndex += 1;
    showStep();
  } else {
    goHome();                            // the last step's button says "Finish"
    render.announce('You have finished the guide.');
  }
}

function goBack() {
  if (state.view !== 'guide' || state.stepIndex === 0) return;   // clamped at the first step
  state.stepIndex -= 1;
  showStep();
}

function openMagnifier() {
  setView('magnifier');                  // camera logic arrives in Stage 3c
}

/* ---------- Event wiring ---------- */
function bindEvents() {
  // EVENT DELEGATION: one listener on the <ul> serves every card, including
  // cards created later. closest() finds the card even if a <span> inside it was tapped.
  $('service-list').addEventListener('click', (event) => {
    const card = event.target.closest('[data-slug]');
    if (card) openGuide(card.dataset.slug);
  });

  // The Retry button is created dynamically, so delegate from its stable parent.
  $('home-status').addEventListener('click', (event) => {
    if (event.target.closest('#btn-retry')) loadServices();
  });

  $('btn-next').addEventListener('click', goNext);
  $('btn-back').addEventListener('click', goBack);
  $('btn-home').addEventListener('click', goHome);
  $('btn-open-magnifier').addEventListener('click', openMagnifier);
}

/* ---------- Start ---------- */
// Module scripts are deferred: the HTML is fully parsed before this runs,
// so no DOMContentLoaded listener is needed.
initSettings();
bindEvents();
loadServices();