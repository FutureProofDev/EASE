/* =====================================================================
   render.js: everything that draws on screen. It never fetches data and
   never decides what happens next; app.js tells it WHAT to show.

   DOM strategy used throughout:
   - textContent, never innerHTML, for anything that came from the database
     (so even malicious text could never run as HTML/script = no XSS).
   - Build lists in a DocumentFragment, then insert ONCE (one reflow).
   - Views are toggled with the `hidden` attribute, not rebuilt.
   - A step change only updates a few text nodes; it rebuilds nothing.
   ===================================================================== */

const $ = (id) => document.getElementById(id);

// Look every element up ONCE (modules run after the HTML is parsed),
// instead of searching the document on every click.
const els = {
  views: { home: $('view-home'), guide: $('view-guide'), magnifier: $('view-magnifier') },
  nav: document.querySelector('.nav-bar'),
  btnBack: $('btn-back'), btnNext: $('btn-next'),
  homeStatus: $('home-status'), serviceList: $('service-list'),
  guideTitle: $('guide-title'),
  stepCurrent: $('step-current'), stepTotal: $('step-total'), progress: $('step-progress'),
  stepText: $('step-text'),
  figure: $('step-figure'), source: $('step-source'), image: $('step-image'),
  action: $('step-action'),
  btnListen: $('btn-listen'),
  definitionPanel: $('definition-panel'),
  tariffSection: $('tariff-section'), tariffBody: $('tariff-body'),
  announcer: $('announcer'),
  videoFrame: $('video-frame'), cameraVideo: $('camera-video'),
  captured: $('captured-image'), cameraStatus: $('camera-status'),
  btnCapture: $('btn-capture'), btnRetake: $('btn-retake'),
  magnifierHelp: $('magnifier-help'),
  btnMic: $('btn-mic'), micStatus: $('mic-status'),
  voiceHelp: document.querySelector('.voice-help'),
};

const IMAGE_DIR = 'assets/images/';
const IMAGE_SIZES = '(min-width: 48rem) 40rem, 100vw';
// Only tel: links made of digits, * # + (and %23 for #) are allowed. If the
// database were ever tampered with, a "javascript:" link would be refused.
const SAFE_TEL = /^tel:[0-9*#%+]+$/i;

let tariffCount = 0;

/* ---------- Screen-reader announcements ---------- */
export function announce(message) {
  // Clear first, then set: otherwise repeating the same sentence is not re-read.
  els.announcer.textContent = '';
  setTimeout(() => { els.announcer.textContent = message; }, 50);
}

/* ---------- Views and navigation ---------- */
export function showView(name, { focus = true } = {}) {
  for (const [key, section] of Object.entries(els.views)) {
    section.hidden = key !== name;
  }
  window.scrollTo(0, 0);
  if (focus) {
    // Move keyboard/screen-reader focus to the new view's heading, so
    // assistive tech reads "what is this page" after a change (WCAG 2.4.3).
    const heading = els.views[name].querySelector('h2');
    heading.tabIndex = -1;       // focusable by script, not part of the Tab order
    heading.focus();
  }
}

export function updateNav(view, stepIndex, total) {
  els.nav.hidden = view === 'home';                    // Home needs no nav bar
  const inGuide = view === 'guide';
  els.btnBack.hidden = !inGuide;
  els.btnNext.hidden = !inGuide;
  if (!inGuide) return;

  els.btnBack.disabled = stepIndex === 0;
  const last = stepIndex === total - 1;
  const arrow = document.createElement('span');
  arrow.setAttribute('aria-hidden', 'true');           // decoration only
  els.btnNext.replaceChildren(last ? 'Finish ' : 'Next ', arrow);
}

/* ---------- Home ---------- */
export function showHomeStatus(message, { retry = false } = {}) {
  els.homeStatus.hidden = false;
  els.homeStatus.textContent = message;
  if (retry) {
    const button = document.createElement('button');
    button.id = 'btn-retry';
    button.type = 'button';
    button.className = 'btn btn-primary btn-block';
    button.textContent = 'Try again';
    els.homeStatus.append(button);
  }
}
export function hideHomeStatus() {
  els.homeStatus.hidden = true;
  els.homeStatus.textContent = '';
}

function span(className, text) {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  return node;
}



// Which line icon each category gets. Unknown categories fall back to "list",
// so a guide added to the database later still looks right.
const CATEGORY_ICONS = { 'Mobile Money': 'phone', Health: 'heart', Utilities: 'bolt' };

export function renderServices(services) {
  const fragment = document.createDocumentFragment();
  for (const service of services) {
    const item = document.createElement('li');
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'service-card';
    card.dataset.slug = service.slug;

    const icon = span('card-icon', '');
    icon.dataset.icon = CATEGORY_ICONS[service.category] || 'list';   // CSS draws the icon from this
    icon.setAttribute('aria-hidden', 'true');

    const count = Number(service.step_count);
    const body = span('card-body', '');
    body.append(
      span('card-title', service.title),
      span('card-summary', service.summary),
      span('card-cta', `Show me how, ${count} ${count === 1 ? 'step' : 'steps'}`)
    );

    card.append(icon, body);
    item.append(card);
    fragment.append(item);
  }
  els.serviceList.replaceChildren(fragment);
}
/* ---------- Guide ---------- */
export function showGuideHeader(service) {
  els.guideTitle.textContent = service.title;
}

export function renderStep(step, index, total) {
  els.stepCurrent.textContent = index + 1;
  els.stepTotal.textContent = total;
  els.progress.max = total;
  els.progress.value = index + 1;
  els.stepText.textContent = step.instruction_text;
  els.definitionPanel.hidden = true;           // an old word meaning must not linger

  renderImage(step);
  renderAction(step);
  // Costs are shown as "before you start" info, on the first step only.
  els.tariffSection.hidden = !(index === 0 && tariffCount > 0);
}

function renderImage(step) {
  const { figure, source, image } = els;
  if (!step.image_base) { figure.hidden = true; return; }

  const base = IMAGE_DIR + step.image_base;
  const candidates = (ext) => `${base}-480.${ext} 480w, ${base}-960.${ext} 960w`;

  // If a file is missing, hide the figure instead of showing a broken icon.
  image.onerror = () => { figure.hidden = true; };
  image.loading = 'eager';                     // this is the active step: load now
  image.alt = step.image_alt || '';            // descriptive alt text from the database
  image.sizes = IMAGE_SIZES;
  image.srcset = candidates('jpg');            // fallback format
  image.src = `${base}-960.jpg`;
  source.removeAttribute('srcset');
  figure.hidden = false;
}

function renderAction(step) {
  const link = els.action;
  if (step.action_href && SAFE_TEL.test(step.action_href)) {
    link.href = step.action_href;              // e.g. tel:*929%23 opens the dialler
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true'); 
    link.replaceChildren(icon, ` ${step.action_label || 'Call'}`);
    link.hidden = false;
  } else {
    link.hidden = true;
    link.removeAttribute('href');
  }
}

/* ---------- Tariff table ---------- */
// Display-only formatting. The API sends money as a string ("30.00") so no
// floating-point maths ever touches it.
const formatCedis = (amount) => `GH₵ ${Number(amount).toFixed(2)}`;

export function renderTariffs(rows) {
  tariffCount = rows.length;
  const fragment = document.createDocumentFragment();
  for (const row of rows) {
    const tr = document.createElement('tr');

    const label = document.createElement('th');
    label.scope = 'row';                       // row header: screen readers read "Item, then Amount"
    label.textContent = row.item_label;

    const amount = document.createElement('td');
    amount.textContent = formatCedis(row.amount_ghs);
    const note = document.createElement('td');
    note.textContent = row.notes ?? '';

    tr.append(label, amount, note);
    fragment.append(tr);
  }
  els.tariffBody.replaceChildren(fragment);
}


/* ---------- Listen button ---------- */
export function setListenState(isSpeaking) {
  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = isSpeaking ? '⏹' : '🔊';
  // The label itself changes, so screen readers hear what a tap will do.
  els.btnListen.replaceChildren(icon, isSpeaking ? ' Stop listening' : ' Listen to this step');
}

export function hideListenButton() {
  els.btnListen.hidden = true;           // speech unsupported: no dead button
}

/* ---------- ID magnifier ---------- */
function setRetakeLabel(text) {
  els.btnRetake.replaceChildren(text);
}

export function setCameraStatus(message) {
  els.cameraStatus.textContent = message;     // role="status" makes screen readers read it
}

// State 1: live camera, ready to capture.
export function showCameraLive() {
  els.captured.hidden = true;
  els.captured.removeAttribute('src');
  els.videoFrame.hidden = false;
  els.btnCapture.hidden = false;
  els.btnRetake.hidden = true;
  els.magnifierHelp.hidden = false;
  setCameraStatus('');
}

// State 2: picture taken, shown enlarged at the top.
export function showCaptured(url) {
  els.videoFrame.hidden = true;
  els.captured.src = url;
  els.captured.hidden = false;
  els.btnCapture.hidden = true;
  els.magnifierHelp.hidden = true;
  setRetakeLabel('Take another picture');
  els.btnRetake.hidden = false;
  setCameraStatus('Pinch the picture with two fingers to zoom in even more.');
  els.btnRetake.focus();                      // the hidden Take button had focus; move it somewhere real
}

// State 3: camera failed. Explain and offer a retry.
export function showCameraError(message) {
  els.videoFrame.hidden = true;
  els.captured.hidden = true;
  els.btnCapture.hidden = true;
  els.magnifierHelp.hidden = false;
  setRetakeLabel('Try the camera again');
  els.btnRetake.hidden = false;
  setCameraStatus(message);
}


/* ---------- Voice control ---------- */
export function setMicState(isOn, message = '') {
  // aria-pressed tells screen readers on/off; the CSS already fills the button when "true".
  els.btnMic.setAttribute('aria-pressed', String(isOn));
  els.micStatus.textContent = message;   // role="status" reads it aloud
}

export function hideMicButton(hint) {
  els.btnMic.hidden = true;
  els.voiceHelp.hidden = true;
  els.micStatus.textContent = hint;    // visible text: tooltips do not work on touch screens
}