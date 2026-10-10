/* =====================================================================
   app.js: the conductor. It owns the STATE and wires events to actions.
   Pattern: user does something -> an action changes `state` -> render
   functions draw it. Buttons today, voice commands in Stage 3c: both will
   call the SAME actions, so they can never disagree.
   ===================================================================== */
import * as api from './api.js';
import * as render from './render.js';
import { initSettings, changeZoom } from './settings.js';
import {
  speak, stopSpeaking, isSpeaking, onSpeechStateChange, speechSupported,
  startCamera, stopCamera, captureId, cameraSupported, cameraErrorMessage,
  voiceSupported, startVoice, stopVoice, isVoiceOn, setVoiceHandlers,
  recentlySpoke,
} from './hardware.js';

const $ = (id) => document.getElementById(id);

// The single source of truth. (Zoom and theme live in settings.js.)
const state = {
  view: 'home',     // 'home' | 'guide' | 'magnifier'
  services: [],
  guide: null,      // the service being read
  steps: [],        // ordered array from steps.php
  stepIndex: 0,     // array traversal: which element is showing
  loading: false,   // blocks double-taps while a request is running
  capturedUrl: null, // For camera
};

/* ---------- Drawing helpers ---------- */
function setView(view) {
  stopSpeaking();                        // never keep reading a screen the user has left
  state.view = view;
  render.showView(view);
  render.updateNav(view, state.stepIndex, state.steps.length);
  if (view !== 'magnifier') releaseMagnifier();   // leaving the magnifier: camera OFF, photo erased
}

function showStep({ announceStep = true } = {}) {
  stopSpeaking();
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

function toggleListen() {
  if (state.view !== 'guide') return;
  if (isSpeaking()) { stopSpeaking(); return; }     // a second tap = stop
  const step = state.steps[state.stepIndex];
  speak(`Step ${state.stepIndex + 1} of ${state.steps.length}. ${step.instruction_text}`);
}

/* ---------- ID magnifier ---------- */
function releaseMagnifier() {
  stopCamera();
  if (state.capturedUrl) {
    URL.revokeObjectURL(state.capturedUrl);     // frees the photo from memory
    state.capturedUrl = null;
  }
}

async function startMagnifier() {
  releaseMagnifier();
  render.showCameraLive();
  if (!cameraSupported) {
    render.showCameraError('The camera needs a secure connection (https or localhost) and a supported browser.');
    return;
  }
  render.setCameraStatus('Starting camera. If asked, tap Allow.');
  try {
    const live = await startCamera($('camera-video'));
    if (live) render.setCameraStatus('Camera ready.');
  } catch (error) {
    render.showCameraError(cameraErrorMessage(error));
  }
}

function openMagnifier() {
  setView('magnifier');
  startMagnifier();
}

let capturing = false;                          // blocks double-taps while the frame is saved
async function takePicture() {
  if (state.view !== 'magnifier' || capturing || state.capturedUrl) return;
  capturing = true;
  try {
    state.capturedUrl = await captureId($('camera-video'));
    stopCamera();                               // the picture is taken: switch the camera off
    render.showCaptured(state.capturedUrl);
    render.announce('Picture taken. Your ID card is shown enlarged.');
  } catch (error) {
    render.setCameraStatus(error.message);
  } finally {
    capturing = false;
  }
}

function retake() {
  if (state.view === 'magnifier') startMagnifier();
}


/* ---------- Voice control ---------- */
// Data-driven: each command is a list of phrases plus the SAME action a button calls.
// To add a command later, add one line here.
const COMMANDS = [
  { say: ['zoom in', 'bigger'],                              run: () => changeZoom(1) },
  { say: ['zoom out', 'smaller'],                            run: () => changeZoom(-1) },
  { say: ['take picture', 'take a picture', 'take photo'],   run: takePicture },
  { say: ['next'],                                           run: goNext },
  { say: ['back', 'previous'],                               run: goBack },
  { say: ['home'],                                           run: goHome },
  { say: ['read', 'listen'],                                 run: toggleListen },
];

function findCommand(guesses) {
  for (const guess of guesses) {
    // Lowercase, strip punctuation, pad with spaces. Padding means "next" matches
    // "go next please" but "read" does not match "already".
    const text = ` ${guess.toLowerCase().replace(/[^a-z ]/g, ' ')} `;
    for (const command of COMMANDS) {
      if (command.say.some((phrase) => text.includes(` ${phrase} `))) return command;
    }
  }
  return null;
}

const MAX_COMMAND_WORDS = 3;           // real commands are short; chatter is not
let lastRun = { name: '', at: 0 };
const wordCount = (text) => text.trim().split(/\s+/).filter(Boolean).length;

function handleHeard(guesses) {
  // 1. Never obey the app's own voice, or its echo just after it stops.
  if (recentlySpoke(1500)) return;

  // 2. Room-chatter filter: "I'll go home next week" is not a command.
  const short = guesses.filter((g) => wordCount(g) <= MAX_COMMAND_WORDS);
  if (short.length === 0) return;      // a long sentence: say nothing

  const command = findCommand(short);
  if (!command) {
    render.setMicState(true, `Heard "${short[0].trim()}". Try: Next, Back, Home, Zoom in, Zoom out or Read.`);
    return;
  }

  // 3. Android Chrome sometimes reports one phrase twice: ignore repeats within 1.2 s.
  const now = Date.now();
  if (command.say[0] === lastRun.name && now - lastRun.at < 1200) return;
  lastRun = { name: command.say[0], at: now };

  render.setMicState(true, `Heard: "${short[0].trim()}"`);
  command.run();
}

function toggleVoice() {
  if (isVoiceOn()) stopVoice();
  else startVoice();
}


/* ---------- Event wiring ---------- */
function bindEvents() {
  // EVENT DELEGATION: one listener on the <ul> serves every card.
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
  $('btn-listen').addEventListener('click', toggleListen);
  $('btn-capture').addEventListener('click', takePicture);
  $('btn-retake').addEventListener('click', retake);
  $('btn-mic').addEventListener('click', toggleVoice);
}



// If the user switches app or locks the phone, switch the mic and camera OFF.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (isVoiceOn()) stopVoice();
    stopCamera();
    stopSpeaking();
  } else if (state.view === 'magnifier' && !state.capturedUrl) {
    startMagnifier();                  // they came back: restart the live view
  }
});


/* ---------- Start ---------- */
// Module scripts are deferred: the HTML is fully parsed before this runs,
// so no DOMContentLoaded listener is needed.
initSettings();
bindEvents();
onSpeechStateChange(render.setListenState);
if (!speechSupported) render.hideListenButton();
setVoiceHandlers({
  onHeard: handleHeard,
  onState: (on, errorText) =>
    render.setMicState(on, errorText || (on ? 'Listening. Say Next, Back, Home, Zoom in, Zoom out or Read.' : '')),
});
if (!voiceSupported) render.hideMicButton('Voice control needs Chrome or Edge. Everything else works without it.');
loadServices();