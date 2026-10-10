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

function setSpeaking(value) {
  speaking = value;
  onChange(value);
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
  await video.play().catch(() => {});          // autoplay attribute is set too
  return true;
}

/** Switches the camera off: turns off the light and saves battery. */
export function stopCamera() {
  startToken++;                                // invalidates any start still waiting
  if (stream) {
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

let recognition = null;
let wantListening = false;      // what the USER asked for (the mic button state)
let handlers = { onHeard: () => {}, onState: () => {} };

export function setVoiceHandlers(newHandlers) { handlers = newHandlers; }
export function isVoiceOn() { return wantListening; }

function voiceErrorMessage(code) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'The microphone is blocked. Allow the microphone in your browser settings, then try again.';
    case 'audio-capture':
      return 'No microphone was found on this device.';
    case 'network':
      return 'Voice control needs an internet connection.';
    default:
      return 'Voice control stopped. Please try again.';
  }
}

export function startVoice() {
  if (!voiceSupported || wantListening) return;
  wantListening = true;

  recognition = new Recognition();
  recognition.lang = 'en-GH';          // Ghanaian English; the browser falls back if unsupported
  recognition.continuous = true;       // keep listening for several commands
  recognition.interimResults = false;  // only final results, no half-finished guesses
  recognition.maxAlternatives = 3;     // the engine's top 3 guesses for each phrase

  recognition.onstart = () => handlers.onState(true, '');

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (!result.isFinal) continue;
      // Pass ALL guesses on: if guess 1 is "necks" but guess 2 is "next", we still catch it.
      handlers.onHeard(Array.from(result).map((guess) => guess.transcript));
    }
  };

  recognition.onerror = (event) => {
    // Silence and manual stops are normal; ignore them.
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    wantListening = false;
    handlers.onState(false, voiceErrorMessage(event.error));
  };

  // Browsers end a session by themselves after a pause. While the user
  // still wants voice control, quietly start a new session.
  recognition.onend = () => {
    if (!wantListening) return;
    setTimeout(() => {
      if (!wantListening) return;
      try { recognition.start(); } catch { /* already starting: ignore */ }
    }, 300);
  };

  try {
    recognition.start();               // the first start shows the permission prompt
  } catch {
    wantListening = false;
    handlers.onState(false, voiceErrorMessage('other'));
  }
}

export function stopVoice() {
  wantListening = false;
  if (recognition) recognition.abort();
  handlers.onState(false, '');
}