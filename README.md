# EASE: Elder Access and Service Engine

EASE is a phone-first website that walks older people through everyday tasks in Ghana: registering for MTN MoMo, renewing NHIS membership, and buying prepaid electricity from ECG. Each task is broken into short steps, shown one at a time, with big buttons and the option to have every step read aloud or controlled by voice.

It started as a university web technologies project. The idea came from a simple observation: a lot of ordinary jobs now happen on a phone, and the menus are not always kind to people who did not grow up with one.

## What it does

- Three guides, each shown **one step at a time** with Next, Back and Home buttons
- **Listen** button that reads the current step aloud
- **Voice control** for "next", "back", "home", "zoom in", "zoom out", "read" and "take picture"
- **ID card magnifier**: uses the phone camera, crops the middle of the frame and enlarges it so small print is readable
- **Dial buttons** that open the phone's dialler with the right short code, such as `*170#`
- **Settings**: five text sizes and a high-contrast (yellow on black) theme, remembered on the device
- A costs table for each guide
- A plain **no-JavaScript version** (`nojs.html`) that people are redirected to automatically if scripts are switched off

## Built with

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3 (variables, Flexbox, Grid), vanilla JavaScript modules. No frameworks or libraries. |
| Backend | PHP 8.1+ with PDO, returning JSON only |
| Database | MySQL (3 related tables) |
| Browser APIs | `speechSynthesis`, `SpeechRecognition`, `getUserMedia`, `localStorage`, `<dialog>` |

## How the pieces fit together

```
 Phone browser                        Server                       Database
┌──────────────────────┐   JSON    ┌──────────────┐   SQL     ┌─────────────┐
│ index.html + css/    │ ───────▶  │ api/*.php    │ ───────▶  │ MySQL       │
│ js/ (modules)        │ ◀───────  │ (never HTML) │ ◀───────  │ 3 tables    │
│ localStorage         │           └──────────────┘           └─────────────┘
└──────────────────────┘
```

A few rules the project sticks to:

1. **PHP never produces HTML.** It runs a prepared query and returns JSON. JavaScript draws the page.
2. **No accounts.** Text size and theme are stored in the browser with `localStorage`.
3. **One source of truth.** `app.js` keeps a single `state` object. Buttons and voice commands call the same functions, so they cannot disagree.
4. **Only `api.js` calls `fetch()`.** If the backend changes, there is one file to edit.

## Folder map

```
ease/
├── index.html            The app: header, three screens, nav bar, settings dialog
├── nojs.html             Static one-page version for when JavaScript is off
├── css/
│   ├── theme.css         Colours and sizes as variables (standard + high contrast)
│   ├── layout.css        Page structure and responsive rules
│   ├── components.css    Buttons, cards, icons, table, camera frame, dialog
│   └── nojs.css          Styles for nojs.html only
├── js/
│   ├── app.js            Starts everything; holds state; maps buttons and voice to actions
│   ├── api.js            The only file that calls fetch()
│   ├── render.js         Draws everything on screen
│   ├── settings.js       Text zoom and theme, saved in localStorage
│   └── hardware.js       Speech out, voice commands, camera
├── api/
│   ├── helpers.php       JSON reply format, error handling, input checks
│   ├── db.php            PDO connection with real prepared statements
│   ├── services.php      List of guides
│   ├── steps.php         One guide and its ordered steps
│   ├── tariffs.php       Costs for a guide
│   ├── config.sample.php Template for config.php (database login)
│   └── .htaccess         Blocks web access to config, db and helpers
├── database/
│   ├── schema.sql        Creates the tables
│   └── seed.sql          The three guides and their costs
└── assets/
    └── favicon.svg
```

## Running it on your own computer

You need PHP 8.1 or newer and MySQL. XAMPP or Laragon provide both.

1. Copy the project folder into `htdocs` (XAMPP) or `www` (Laragon). The examples below assume it is called `ease`.
2. Start Apache and MySQL.
3. In phpMyAdmin, create a database called `senior_guide` with collation `utf8mb4_general_ci`.
4. Import `database/schema.sql`, then `database/seed.sql`.
5. Copy `api/config.sample.php` to `api/config.php` and fill in your database details. (On XAMPP the defaults already work.)
6. Open `http://localhost/ease/`.

The camera and microphone only work on `localhost` or an `https://` address. Opening the site from a phone at `http://192.168.x.x/` will block them.

### API endpoints

| Request | Returns |
|---|---|
| `GET api/services.php` | All guides, with a step count |
| `GET api/steps.php?service=nhis-renewal` | One guide and its steps in order |
| `GET api/tariffs.php?service=nhis-renewal` | Costs for that guide |

Every reply looks like `{ "ok": true, "data": ... }` or `{ "ok": false, "error": "..." }`.

## Accessibility

- All text colours checked against WCAG AA contrast (most are well above it)
- Touch targets are at least 60px tall at normal size
- Everything is sized in `rem`, so the text-size setting scales the whole page and the layout re-wraps instead of scrolling sideways
- Pinch-zoom is never blocked
- Clear focus outline on every control, and focus moves to the new screen's heading after each change
- Step changes are announced to screen readers through an `aria-live` region
- Real landmarks (`header`, `nav`, `main`, `footer`), a proper heading order, labelled form controls, a table with a caption and row/column headers
- Native elements where possible: `<dialog>`, `<details>`, `<progress>`
- High-contrast theme and support for the system "reduce motion" setting
- Every voice command also has an on-screen button
- Works without JavaScript through `nojs.html`

## Privacy

- No accounts, no tracking, no cookies
- The ID photo exists only in the browser's memory. It is never uploaded and is erased when you leave the magnifier.
- The microphone and camera start only after a tap and switch off when you leave the page or switch app
- In Chrome, voice recognition sends audio to Google's servers to turn it into text. EASE does not record or store it.
- Saved on the device: text size and theme only

## Browser support

| Browser | Guides, Listen, camera, settings | Voice control |
|---|---|---|
| Chrome / Edge (Android and desktop) | Yes | Yes (needs internet) |
| Firefox | Yes | No: the button is hidden and a note is shown |
| Safari on iPhone | Yes | Unreliable |

## Known limitations

- **Voice control can stop listening** after a few commands. Tapping the Voice control button again restarts it.
- **The guides have not been checked against official sources.** The step wording and short codes are a first draft, and the costs table uses placeholder amounts. Check everything with MTN, the NHIA and ECG before relying on it.
- **Step photos are not included yet.** The database and code support them. A step without a picture simply shows none.
- **The ID magnifier uses a fixed 2× crop of the middle of the frame.** It does not detect the edges of a card.
- The phone's own Back button leaves the app instead of going back a step.
- Progress is not saved between visits.
- A word-meaning dictionary (with AI-written explanations) was planned and left out for time.

## Testing

- Lighthouse on an earlier build: performance 90, accessibility 100, best practices 100, SEO 100. Re-run after any big change.
- Checked by hand: all three guides end to end, settings and persistence after reload, the no-JavaScript redirect, camera permission allowed and blocked, and error messages when the database is unavailable.

## Author

Vladimir Aduama, Web Technologies