/* =====================================================================
   hardware.js: browser hardware APIs.
   Part 1 (this file for now): text-to-speech via window.speechSynthesis.
   It never touches the DOM. It only reports its state through a callback,
   so render.js stays the only file that draws.
   ===================================================================== */

// Feature detection, never browser sniffing. If speech is missing, the
// app hides the Listen button instead of showing one that does nothing.
const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
export const speechSupported = Boolean(synth && 'SpeechSynthesisUtterance' in window);

const RATE = 0.85;        // slightly slower than normal, easier for older listeners
let voice = null;         // the chosen voice (null = browser default)
let speaking = false;
let currentUtterance = null;
let onChange = () => {};  // app.js registers a callback here

/* ---------- Choosing a voice ---------- */
// Voices load asynchronously (Chrome returns [] at first), so we choose
// once now and again whenever the browser says the list changed.
function pickVoice() {
  const voices = synth.getVoices();
  // Android reports "en_GB" with an underscore; normalise before comparing.
  const norm = (v) => v.lang.replace('_', '-');
  const preferred = ['en-GH', 'en-NG', 'en-GB', 'en-ZA', 'en-US'];  // closest accents first
  for (const lang of preferred) {
    const match = voices.find((v) => norm(v) === lang);
    if (match) { voice = match; return; }
  }
  voice = voices.find((v) => norm(v).startsWith('en')) || null;
}

if (speechSupported) {
  pickVoice();
  synth.addEventListener('voiceschanged', pickVoice);
}

/* ---------- Public API ---------- */
export function onSpeechStateChange(callback) { onChange = callback; }
export function isSpeaking() { return speaking; }

let lastSpokeAt = 0;                    // when the app's own voice last finished

function setSpeaking(value) {
  if (speaking && !value) lastSpokeAt = Date.now();   // only when speech actually ENDS
  speaking = value;
  onChange(value);
}

/** True while speaking, and for `ms` afterwards (the microphone still hears the echo). */
export function recentlySpoke(ms) {
  return speaking || Date.now() - lastSpokeAt < ms;
}
export function speak(text) {
  if (!speechSupported || !text) return;
  synth.cancel();                       // never queue: new speech replaces old

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = RATE;
  utterance.lang = voice ? voice.lang : 'en-GB';
  if (voice) utterance.voice = voice;

  // Events from a cancelled utterance arrive late. Ignore any event that
  // is not from the CURRENT utterance, or the button would flicker.
  const finish = () => {
    if (currentUtterance !== utterance) return;
    currentUtterance = null;
    setSpeaking(false);
  };
  utterance.onend = finish;
  utterance.onerror = finish;

  // Keep a reference: Chrome can garbage-collect an utterance mid-speech
  // and then never fire onend (a known bug).
  currentUtterance = utterance;
  setSpeaking(true);                    // flip the button now, not after a delay
  synth.speak(utterance);
}

export function stopSpeaking() {
  if (!speechSupported) return;
  currentUtterance = null;              // makes any late events from the old one get ignored
  synth.cancel();
  setSpeaking(false);
}





// CAMERA
/* =====================================================================
   Part 2: camera (navigator.mediaDevices.getUserMedia) + fixed 2x crop.
   ===================================================================== */

const ZOOM = 2;                 // fixed digital zoom baked into the captured pixels
let stream = null;              // the live MediaStream, so we can switch the camera OFF
let activeVideo = null;         // the <video> showing the stream, so we can detach it
let startToken = 0;             // guards against "user left while permission prompt was open"

// On plain http (not localhost) navigator.mediaDevices is undefined: browsers
// only expose the camera in a secure context.
export const cameraSupported = Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

/** Starts the rear camera in <video>. Returns true if the camera is now live. */
export async function startCamera(video) {
  stopCamera();
  const token = ++startToken;

  const newStream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },   // rear camera on phones; any webcam on laptops
      width: { ideal: 1920 }, height: { ideal: 1080 },
    },
    audio: false,                              // never ask for the microphone here
  });

  // The user may have pressed Home while the permission prompt was open.
  // If so, switch this stream off immediately, or the camera light stays on.
  if (token !== startToken) {
    newStream.getTracks().forEach((track) => track.stop());
    return false;
  }
  stream = newStream;
  video.srcObject = stream;
  activeVideo = video;
  await video.play().catch(() => {});          // autoplay attribute is set too
  return true;
}

/** Switches the camera off: turns off the light and saves battery. */
export function stopCamera() {
  startToken++;                                // invalidates any start still waiting
  if (stream) {
    if (activeVideo) { activeVideo.srcObject = null; activeVideo = null; }
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
}

/** Plain-English messages for the errors getUserMedia can throw. */
export function cameraErrorMessage(error) {
  switch (error && error.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'The camera is blocked. Allow the camera in your browser settings, then try again.';
    case 'NotFoundError':
      return 'No camera was found on this device.';
    case 'NotReadableError':
      return 'The camera is being used by another app. Close that app and try again.';
    default:
      return 'The camera could not start. Please try again.';
  }
}

/**
 * Crops the centre 50% of what the user SEES (the dashed box) and returns
 * an object URL of the result: a real 2x zoom baked into the pixels.
 */
export function captureId(video) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return Promise.reject(new Error('The camera is not ready yet. Please wait a moment.'));

  // The <video> uses object-fit: cover, so the screen shows only PART of the
  // raw frame. Work out that visible part first, so the crop matches the dashed box.
  const frameAspect = video.clientWidth / video.clientHeight;
  const videoAspect = vw / vh;
  let visW = vw;
  let visH = vh;
  if (videoAspect > frameAspect) visW = vh * frameAspect;   // sides are cut off on screen
  else visH = vw / frameAspect;                              // top and bottom are cut off

  // Centre crop of the visible area, ZOOM times smaller than it.
  const cw = Math.round(visW / ZOOM);
  const ch = Math.round(visH / ZOOM);
  const sx = Math.round((vw - cw) / 2);
  const sy = Math.round((vh - ch) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  canvas.getContext('2d').drawImage(video, sx, sy, cw, ch, 0, 0, cw, ch);

  // toBlob is async and non-blocking; an object URL points at memory only,
  // nothing is ever uploaded.
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('Could not save the picture.'))),
      'image/jpeg', 0.92
    );
  });
}




/* =====================================================================
   Part 3: voice commands (SpeechRecognition).
   This file only LISTENS and reports words. app.js decides what the
   words mean, and render.js draws the status.
   ===================================================================== */

// Chrome and Edge expose it under a "webkit" prefix.
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
export const voiceSupported = Boolean(Recognition);

const MAX_FAILURES = 3;        // give up after this many failed restarts in a row
const MIN_HEALTHY_MS = 1000;   // a session that dies faster than this, having heard nothing, is a failure

let recognition = null;
let wantListening = false;     // what the USER asked for (the mic button state)
let failures = 0;
let startedAt = 0;
let heardWords = false;
let announcedOn = false;       // so a quiet restart does not overwrite the status line
let restartTimer = null;
let handlers = { onHeard: () => {}, onState: () => {} };

export function setVoiceHandlers(newHandlers) { handlers = newHandlers; }
export function isVoiceOn() { return wantListening; }

function voiceErrorMessage(code) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'The microphone is blocked. Allow the microphone in your browser settings, then tap Voice control again.';
    case 'audio-capture':
      return 'No microphone was found on this device.';
    case 'network':
      return 'Voice control needs the internet and cannot reach it right now. The buttons still work. Tap Voice control to try again.';
    default:
      return 'Voice control stopped. Tap Voice control to try again.';
  }
}

/** One place that switches voice OFF and tells the UI why. */
function giveUp(message) {
  wantListening = false;
  announcedOn = false;
  clearTimeout(restartTimer);
  if (recognition) { try { recognition.abort(); } catch { /* already stopped */ } }
  handlers.onState(false, message);
}

function startSession() {
  if (!wantListening) return;
  startedAt = Date.now();
  heardWords = false;
  try {
    recognition.start();
  } catch {
    // Thrown if the previous session has not fully ended yet. Count it,
    // never ignore it: this was the silent failure behind "stops after 3 commands".
    failures += 1;
    scheduleRestart();
  }
}

function scheduleRestart() {
  if (!wantListening) return;
  if (failures >= MAX_FAILURES) {
    giveUp('Voice control disconnected. Tap Voice control to try again.');
    return;
  }
  clearTimeout(restartTimer);
  restartTimer = setTimeout(startSession, 300 * (failures + 1));   // wait longer after each failure
}

export function startVoice() {
  if (!voiceSupported || wantListening) return;
  if (!window.isSecureContext) {
    handlers.onState(false, 'Voice control needs a secure connection (https).');
    return;
  }
  wantListening = true;
  failures = 0;
  announcedOn = false;

  recognition = new Recognition();
  recognition.lang = 'en-GH';          // Ghanaian English
  recognition.continuous = true;       // set to false if Android keeps dropping out
  recognition.interimResults = false;  // only final results, no half-finished guesses
  recognition.maxAlternatives = 3;     // the engine's top 3 guesses for each phrase

  recognition.onstart = () => {
    if (announcedOn) return;
    announcedOn = true;
    handlers.onState(true, '');
  };

  recognition.onresult = (event) => {
    heardWords = true;
    failures = 0;                      // it is clearly working
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (!result.isFinal) continue;
      handlers.onHeard(Array.from(result).map((guess) => guess.transcript));
    }
  };

  recognition.onerror = (event) => {
    if (event.error === 'no-speech' || event.error === 'aborted') return;   // normal
    if (event.error === 'language-not-supported') { recognition.lang = 'en-GB'; return; }
    giveUp(voiceErrorMessage(event.error));
  };

  // Browsers end sessions by themselves after silence. Restart quietly, but
  // count a session that died instantly as a failure.
  recognition.onend = () => {
    if (!wantListening) return;
    const healthy = heardWords || Date.now() - startedAt >= MIN_HEALTHY_MS;
    failures = healthy ? 0 : failures + 1;
    scheduleRestart();
  };

  startSession();
}

export function stopVoice() { giveUp(''); }