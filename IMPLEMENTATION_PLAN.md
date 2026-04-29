# Bosque Aural — UI architecture refresh

Implementation plan for an agent picking up this repo cold. The goal is to evolve the current minimal-HUD experience into a small, layered control surface that supports walk/stop for random walk, makes the keyboard mode discoverable, prepares for a future gyroscope engine on mobile, and turns "now playing" into a live, expandable list of nearby trees ordered by audibility.

This plan is opinionated about layout and behavior. Implementation details (exact pixel values, easing curves, copy phrasing) are suggestions — match the existing aesthetic (lowercase, monospace, sparse, dark) and feel free to adjust.

---

## 1. What this site is

`Bosque Aural` is a single-page audio installation. The user enters, an `AudioContext` boots, 13 looping audio sources are positioned in 3D space using HRTF panning, and the user wanders through them. Currently a `#minimapa` canvas in the center renders green dots (trees) and a white dot (the listener) in 2D — that canvas IS the visible "forest" the user navigates. There is no separate 3D scene; the canvas plus the spatial audio is the entire experience.

Two movement engines exist:

- `random-walk-mode.js` — autonomous wander
- `keyboard-mouse-mode.js` — WASD + pointer-locked mouse (desktop only, requires pointer lock)

A `device-profile.js` filters which modes are available per platform. A `movement-engine.js` orchestrates the active mode. `main.js` wires everything together, runs the per-frame loop, and renders the minimap.

The audio model is distance-driven: each tree's `gainNode` ramps to 1 when the listener is within `DIST_ACTIVACION = 50`, otherwise ramps to 0. The HRTF panner on each tree handles spatialization automatically based on listener position/orientation.

## 2. Design direction (summary)

Five UI regions sit on top of the existing minimap, all at low opacity, all auto-fading after a few seconds of no input. From corners inward:

- **Top-left** — project wordmark, low contrast, decorative.
- **Top-right** — mode pill (current mode + status dot) and a settings gear. Clicking the pill opens a small popover to switch modes; the gear opens master volume + about.
- **Bottom-center** — primary action region whose contents depend on the active mode:
  - random walk → **Walk / Stop** toggle button
  - keyboard → small WASDQE hint inset (replaces button; user has explicit input)
  - gyroscope (future) → calibrate button when drift is detected, otherwise empty
- **Bottom-left** — **Nearby trees** panel. Collapsed by default to a single-row card showing the dominant track. Tapping/clicking the card expands it upward into a scrollable list of all trees, ordered by closeness, with a per-row audibility bar that visualizes how prominent each track is in the live mix. Trees outside `DIST_ACTIVACION` show in a separate "out of range" section.
- **Center** — the minimap remains, unchanged, as the visual canvas.

The whole HUD auto-fades to ~10% opacity after ~3s of no mouse/touch/keyboard activity, full opacity on any input. Spacebar is a global walk/stop toggle (active only when the current mode supports it).

Mobile collapses the same regions into a top-anchored now-playing card (collapsed) and a bottom-sheet expanded list, with the walk/stop button rendered as a large circular touch target at the bottom thumb zone. Keyboard mode is hidden on mobile (already filtered by `availableOn.mobile = false`).

## 3. Architecture decisions

**Stay vanilla.** The repo is intentionally framework-free. Don't introduce React, Vue, or a build-time CSS pipeline. Add new code as ES modules following the existing style: a factory function that returns an object with explicit lifecycle methods.

**Don't break the mode contract.** `random-walk-mode.js` and `keyboard-mouse-mode.js` both expose `{ meta, getUiHints, setup, teardown, update }`. New modes (gyroscope) and any per-mode UI extensions should follow the same contract. `meta` should grow optional capability flags (see §6.4).

**Walk/stop lives inside the mode.** The walk/stop control is conceptually a property of the random-walk engine — when paused, it should hold position. So state goes in `random-walk-mode.js`. The button in the DOM is a thin view that calls `mode.setWalking(bool)` and reads `mode.isWalking()`.

**"Now playing" is a derived view.** The list is computed every frame from the listener position and the `ARBOLES` array. Don't store list state separately. The audibility value per tree is a pure function of `distance(listener, tree)` and `DIST_ACTIVACION`.

**One module per concern.** Add three small modules rather than one big one:

- `now-playing.js` — owns the bottom-left card/list DOM and renders it from a per-frame state snapshot
- `idle-fader.js` — encapsulates the "fade HUD after N seconds idle" logic, exposes `wake()`
- `gyroscope-mode.js` — new movement mode (Phase 4), follows the existing mode contract

Each is a factory function returning lifecycle methods (`mount`, `update`, `destroy`).

**Don't repaint the DOM every frame.** The minimap canvas redraws every frame, but the now-playing list is a DOM tree. Diff cheaply: keep a persistent row-per-tree in the DOM, and update only the `transform` order, the bar `width`, and the dominant-row class. No `innerHTML` reassignment in the hot loop.

## 4. Data model changes

`constants.js` currently has `ARBOLES` with `nombre` (track title) but no separate artist field. The design needs both. Add an `artista` field to every entry. Existing track names should stay in `nombre`. Example:

```js
{
  archivo: 'arboles/BrunoMarchetti_BrunoMarchetti_Fungi_2025.mp3',
  artista: 'Bruno Marchetti',
  nombre: 'Fungi',
  pos: { x: -18, y: 2, z: 8 }
}
```

Some entries already have a "lastname firstname" implicit format in `archivo` — the agent should populate `artista` for all 13 entries by reading the filenames in `arboles/` and asking the user to confirm any ambiguous attributions. Do not infer silently; surface the proposed mapping in a comment block at the top of the constants file.

Add the following constants:

```js
export const HUD_IDLE_FADE_MS = 3000;
export const HUD_FADE_OPACITY = 0.1;
export const NEARBY_LIST_MAX_VISIBLE = 16;  // 13 trees + headroom
```

## 5. Phased delivery

Ship in four merge-able phases. Each phase should leave the site working. Don't combine.

### Phase 1 — Walk/stop for random walk

The smallest, highest-value change. The user explicitly asked for this.

Tasks:

1. In `random-walk-mode.js`, add internal `walking` boolean (default `true`). Expose `setWalking(bool)` and `isWalking()` on the returned object. In `update()`, if `!walking`, return the current state unchanged (no position update, no yaw drift).
2. In `meta`, add `supportsWalkToggle: true`. Make `keyboard-mouse-mode.js` return `supportsWalkToggle: false` from its meta.
3. In `index.html`, add `<button id="walk-stop" type="button"></button>` inside `#bosque`, after `#hud`. Hidden by default via CSS.
4. In `main.js`:
   - After `movementEngine` is created, query the active mode's meta for `supportsWalkToggle`. If true, show the button. Set its label/icon based on `mode.isWalking()`.
   - Wire the click handler: `mode.setWalking(!mode.isWalking())`, then refresh the button's visual state.
   - Add a global `keydown` listener for `Space` that calls the same toggle, but only when `supportsWalkToggle` is true. Don't preventDefault if the user is in keyboard mode (it conflicts with the "ascend" binding — see §6.5).
   - In `onModeChange`, re-query `supportsWalkToggle` and show/hide the button accordingly.
5. Style the button per §7.1.

Acceptance:
- Pressing the button (or spacebar) while in random walk pauses the white dot in place; pressing again resumes from the same heading.
- Switching to keyboard mode hides the button; switching back to random walk restores it (preserving previous walking state is fine, default to walking).
- The button's label/icon reflects the current state (Stop ▌▌ when walking, Walk ▶ when paused).

### Phase 2 — Nearby trees list (collapsed + expanded)

Replace the current `#controles` text hint with the new now-playing component.

Tasks:

1. Create `now-playing.js` exporting `createNowPlaying({ container, arboles, distActivacion })`. The factory returns `{ mount(), update(state), destroy() }`.
2. `mount()` builds the DOM:
   - A `<button>` card (collapsed view) showing the dominant track's artist + title, a tiny EQ icon, a "nearby · N in mix" header, and a chevron.
   - A `<section>` (expanded view) with one `<li>` per tree, each containing artist, title, and a `<div class="audibility-bar">` with an inner fill div.
   - Toggle expansion via a class on the container (`.expanded`).
3. `update({ listener, arboles })` runs every frame. For each tree, compute:
   - `distance = sqrt(dx² + dy² + dz²)` using `pos * ESCALA_POSICIONES`
   - `audibility = clamp(1 - distance / DIST_ACTIVACION, 0, 1)`
   - `inMix = audibility > 0`
   Sort trees by descending audibility. Update the dominant row's content and the EQ-bar visibility. For each row, set `transform: translateY(N * row-height)` for ordering (avoid reordering DOM nodes), set the audibility bar width to `audibility * 100%`, and toggle classes for `.in-mix` / `.dominant` / `.out-of-range`.
4. The dominant row gets a subtle background tint and a 3-bar EQ animation (CSS keyframes). When no tree is in the audible range, the collapsed card shows "all quiet" (or the closest tree with a "approaching" caption — pick one based on testing).
5. Tap behaviour: clicking the card toggles expansion. Clicking a row in the expanded list pulses the corresponding tree on the minimap once (a CSS-driven scale + fade ring). Implementation: store row indices, dispatch a `bosque:pulse-tree` custom event on the document, listen in `main.js`, and pass to `dibujarMapa` to flag that tree for one frame of expanded radius.
6. Remove the `#controles` text-hint logic in `main.js` and `actualizarHintControles`. The list replaces it.
7. Wire it up in `main.js`:
   ```js
   const nowPlaying = createNowPlaying({
     container: document.getElementById('now-playing'),
     arboles: ARBOLES,
     distActivacion: DIST_ACTIVACION
   });
   nowPlaying.mount();
   ```
   Inside the `frame()` loop, after `actualizarOyente()` and `activarPorDistancia()`:
   ```js
   nowPlaying.update({ listener: movementState.position });
   ```

Acceptance:
- The card always shows the closest tree at the top; it reorders smoothly as the listener moves.
- The audibility bar of each row is proportional to `1 - d/50`. Trees with `d > 50` collapse into a separate "out of range" section with no bar.
- Tapping a row pulses that tree on the minimap. Random walk continues uninterrupted.
- The dominant row has a tinted background + animated EQ bars; non-dominant audible rows have full-opacity text but no tint; out-of-range rows are dimmed.
- No layout thrash: rows are reordered via `transform`, not DOM moves.

### Phase 3 — Mode pill, settings gear, idle fade

The "polish" pass that ties the layout together.

Tasks:

1. **Move the mode selector** out of `#movement-controls` (bottom-left) and into a new `#mode-pill` at top-right. The pill shows a colored status dot + the current mode label. Clicking it opens a small popover anchored below it, listing available modes (filtered by device profile). Clicking a mode calls `movementEngine.setMode(modeId)` and closes the popover. Keep the existing `availableMetas` filtering logic in `main.js` — only the rendering changes.
2. **Add a settings gear** as a separate `<button id="settings-gear">` to the right of the pill. Clicking opens a popover with: master volume slider, "about this forest" link, optional reset-listener button. Master volume scales `audioCtx.destination` via a single `GainNode` inserted between every panner and `audioCtx.destination`. Default volume = 1.
3. **Idle fader.** Create `idle-fader.js` exporting `createIdleFader({ targets, idleMs, fadedOpacity })`. The factory adds `mousemove`, `keydown`, `touchstart`, `pointermove`, and `wheel` listeners to `document`, and toggles a `.hud-faded` class on each target after `idleMs` of no events. Targets should be the new HUD wrappers (mode pill, settings, walk/stop, now-playing) — NOT the minimap or the splash. Wire it up in `main.js` after the engine is ready.
4. **Project wordmark.** Add a small `<div id="wordmark">bosque aural</div>` at top-left, low contrast.
5. **Cursor visibility.** Currently `#bosque { cursor: none; }`. Change to: cursor visible when HUD is not faded, hidden when faded — except during pointer-lock mode where the existing behavior must continue.

Acceptance:
- Top-right pill shows the active mode and its status dot color (green when walking, gray when stopped, amber when calibrating).
- Mode popover lists only modes available on the current device.
- After 3s of no input, all HUD chrome fades to ~10% opacity. Any input restores it instantly. Pointer-lock mode continues to hide cursor as before.
- Settings popover has a working master volume slider.

### Phase 4 — Gyroscope mode (mobile)

The future-facing engine. Ship behind a feature flag (`?engine=gyroscope` URL param) until it's been tested on real devices.

Tasks:

1. Create `gyroscope-mode.js` following the mode contract. The mode listens to `deviceorientation` for yaw (compass heading) and tilts the listener forward by reading `beta` (front-back tilt). Implementation sketch:
   - On iOS 13+, `DeviceOrientationEvent.requestPermission()` must be called from a user gesture. The first time the mode activates, show a one-time dialog: "this experience uses motion. allow access?" with a button that triggers the permission request. Save the result in `sessionStorage` to avoid re-asking within a session.
   - Map `event.alpha` (compass heading, 0–360°) to listener `yaw` (radians). Note that `alpha` is unstable on Android without geolocation; consult MDN before relying on it. As a fallback, integrate `event.rotationRate.alpha` from `devicemotion` over time.
   - Movement: small forward velocity proportional to `beta` tilt above a deadzone (~10°). Walking forward = listener tilts the device forward.
   - "Phone flat" (beta < 5°) acts as a soft stop.
2. Add `gyroscope` to `meta.availableOn = { desktop: false, mobile: true }` and `meta.requires = ['deviceOrientation']`. Mark `experimental: true` so the mode pill can flag it.
3. In `main.js`, gate the gyroscope mode behind a URL flag check until graduated.
4. Register the mode with `movementEngine` only if available.
5. When gyroscope is the active mode, the bottom-center region shows a small "calibrate" button if the user is more than 5° off heading-zero relative to the phone's frame at mode start. Tapping it re-snaps yaw to current device heading.

Acceptance:
- On iOS Safari with permission granted, tilting the phone forward moves the listener forward; rotating the phone rotates the listener.
- On Android with sensor support, same behavior with `webkitCompassHeading` fallback if needed.
- Permission denied → mode unavailable, gracefully falls back to random walk.
- Walking can be paused via the same "calibrate" affordance (or a small stop pill).

## 6. Detailed change log per file

### 6.1 `index.html`

Add four new elements inside `#bosque`. Order matters for stacking; wrap them in a single `<div id="hud-overlay">` so the idle fader can target one node.

```html
<div id="bosque">
  <div id="pausa-hint">esc &mdash; soltar mouse</div>

  <canvas id="minimapa" width="900" height="900"></canvas>

  <div id="hud-overlay">
    <div id="wordmark">bosque aural</div>

    <div id="top-right">
      <button id="mode-pill" type="button"></button>
      <button id="settings-gear" type="button" aria-label="ajustes"></button>
    </div>

    <button id="walk-stop" type="button"></button>

    <section id="now-playing"></section>
  </div>

  <div id="modal-root"></div>
</div>
```

Remove `#hud` (the centered canvas wrapper) and `#controles` (the text hint container). The canvas stands alone now; the now-playing panel replaces the text hint. `#movement-controls` is removed — the mode pill replaces it.

### 6.2 `styles.css`

Major additions. Keep monospace, lowercase, sparse aesthetic. The full set of selectors needed:

- `#hud-overlay` — `position: absolute; inset: 0; pointer-events: none;` (children opt back in).
- `.hud-faded` — applied by idle fader; `opacity: var(--hud-faded-opacity, 0.1); transition: opacity 1.5s ease;`.
- `#wordmark` — top-left, `position: absolute; top: 1.25rem; left: 1.5rem; opacity: 0.45;`.
- `#top-right` — `position: absolute; top: 1.25rem; right: 1.5rem; display: flex; gap: 0.4rem; pointer-events: auto;`.
- `#mode-pill` — pill shape (`border-radius: 999px`), 24px tall, with a `::before` pseudo-element for the status dot. Inline-flex, gap 6px.
- `#mode-pill[data-status="walking"]::before { background: #97C459; }` and `[data-status="stopped"]::before { background: #888; }`.
- `#settings-gear` — 24×24 square, same border treatment as the pill; an inline SVG gear icon.
- `#walk-stop` — `position: absolute; bottom: 1.5rem; left: 50%; transform: translateX(-50%); pointer-events: auto;`. Pill shape, white background, dark text. Two child spans: an icon span (rendered via CSS for play triangle / stop bars) and a label span.
- `#walk-stop[data-state="walking"]` shows two vertical bars + "stop"; `[data-state="paused"]` shows a play triangle + "walk".
- `#now-playing` — `position: absolute; bottom: 1.5rem; left: 1.5rem; pointer-events: auto;`. Default state shows only the collapsed card; `.expanded` reveals the list, growing upward.
- `#now-playing .card` — single-row collapsed view, ~220px wide, ~56px tall on desktop.
- `#now-playing.expanded .card` — same, plus a chevron rotation.
- `#now-playing .list` — column layout, max-height capped, internal scroll if it overflows; `display: none` when collapsed, `display: block` when expanded.
- `.row` — 44px tall, padding 12px 16px, contains `.artist`, `.title`, `.audibility-bar > .fill`.
- `.row.dominant` — tinted background (`rgba(151, 196, 89, 0.06)`), shows `.eq` indicator (3 spans with `@keyframes` animating heights), brighter text.
- `.row.out-of-range` — placed under `.divider`, dimmed text, no bar.
- `.audibility-bar` — 100% width, 2px tall, `background: rgba(255,255,255,0.08); border-radius: 1px;`.
- `.audibility-bar .fill` — same height, `background: currentColor; transition: width 0.3s ease;`. The dominant row's `.fill` uses the green hex; non-dominant uses white.

Mobile breakpoint (`@media (pointer: coarse)`):
- `#walk-stop` becomes circular: `width: 56px; height: 56px; border-radius: 50%;`.
- `#now-playing` anchors top instead of bottom: `top: 1rem; left: 50%; transform: translateX(-50%); width: calc(100% - 2rem);`.
- Expanded state slides down as a sheet covering ~70% of viewport height; use `max-height: 70vh; overflow-y: auto;` plus a small drag handle (decorative; tap card to toggle).
- `#mode-pill` truncates label to a short form ("random" / "gyro").
- Hide the keyboard hint inset entirely (already handled by mode availability).

CSS custom properties to centralize:

```css
:root {
  --hud-bg: rgba(20, 20, 20, 0.94);
  --hud-border: rgba(255, 255, 255, 0.15);
  --hud-text: rgba(255, 255, 255, 0.9);
  --hud-text-muted: rgba(255, 255, 255, 0.55);
  --hud-faded-opacity: 0.1;
  --green-dot: #97c459;
}
```

### 6.3 `main.js`

Substantial restructure. Concretely:

- Remove `#hud`, `#controles`, `#movement-controls` references.
- Remove `actualizarHintControles`, `renderModeSelector`, `syncModeSelector` — replace with the new mode pill module (inline or a new `mode-pill.js`).
- Add a master gain node between trees and destination (Phase 3). Update `cargarArboles` to connect through it.
- Instantiate `nowPlaying`, `idleFader`, the new mode pill, the walk/stop button, and the settings popover after `movementEngine` is ready.
- In the `frame()` loop, after the existing audio updates, call `nowPlaying.update({ listener: movementState.position })`.
- Add an event listener for `bosque:pulse-tree` that flags the corresponding tree index for a one-frame expanded draw in `dibujarMapa`.

### 6.4 `random-walk-mode.js`

- Add a module-scope `let walking = true;`.
- Expose `setWalking(bool)` and `isWalking()` on the returned object.
- In `update()`, if `!walking`, return `{ ...state }` unchanged. Don't decrement `framesUntilTurn` while paused — so the user resumes from the same pending heading change.
- Update `meta.label` to whatever you want shown in the pill (current value `'random walk'` is fine, lowercase to match).
- Add `meta.supportsWalkToggle = true`.

### 6.5 `keyboard-mouse-mode.js`

- Add `meta.supportsWalkToggle = false`.
- The current Space binding ascends the listener (`KeyQ` || `Space`). Decide one of two things and document the choice in a comment: (a) keep Space as ascend, in which case the global walk/stop spacebar shortcut must be skipped while in keyboard mode; or (b) move ascend to `KeyR` and let Space be a global walk/stop. Recommendation: (a), because changing the existing keyboard binding would surprise current users.

### 6.6 New file: `now-playing.js`

```js
export function createNowPlaying({ container, arboles, distActivacion }) {
  // build DOM once in mount(), update only attribute/class/style each frame
}
```

Reference implementation outline:

```
mount():
  1. Build collapsed card structure
  2. Build expanded list with one row per arbol (in original order, repositioned via transform)
  3. Cache references to per-row .artist / .title / .fill / classlist

update({ listener }):
  1. For each arbol, compute distance and audibility
  2. Sort indices by audibility desc; ties broken by original order
  3. For each arbol, set translateY(rank * rowHeight)
  4. Update .fill width (clamped to non-negative), toggle .dominant on rank 0,
     toggle .in-mix / .out-of-range based on audibility > 0
  5. Update collapsed card content from rank-0 arbol; update header count
```

### 6.7 New file: `idle-fader.js`

```js
export function createIdleFader({ targets, idleMs = 3000 }) {
  // mousemove, keydown, touchstart, pointermove, wheel → wake()
  // setTimeout → idle() adds .hud-faded to all targets
  // returns { wake(), destroy() }
}
```

### 6.8 New file: `gyroscope-mode.js` (Phase 4)

Follow the existing mode contract. Permission gating via `DeviceOrientationEvent.requestPermission` only on iOS. See §5 Phase 4 for behavior.

## 7. Visual language

### 7.1 Walk/stop button

White pill, dark text, monospace. ~88px wide × 30px tall on desktop, 56px circle on mobile. Two states:

- `walking` — two vertical bars (8px tall, 3px wide, 4px apart) + label "stop"
- `paused` — right-pointing triangle (8×10) + label "walk"

Hover: subtle scale to 1.02. Active: scale 0.98. No shadow.

### 7.2 Mode pill

`rgba(255,255,255,0.06)` background, `rgba(255,255,255,0.18)` 0.5px border, fully rounded. Inside: a 5px status dot, then the mode label in 11px monospace. Status dot color reflects state:

- green `#97C459` — walking
- gray `#888` — paused
- amber `#EF9F27` — calibrating (gyroscope only)

### 7.3 Now-playing rows

Row layout (left to right):

- Optional `.eq` (3 vertical bars, 2px wide each, animated heights between 4–10px) — only on the dominant row
- `.artist` — 11px, weight 500, bright
- `.title` — 10px, dimmer, wraps below artist on a separate line
- `.audibility-bar` — full row width, 2px tall, fills proportionally

When a row transitions in/out of the audible set, fade its `.fill` opacity over 300ms rather than snapping.

## 8. Acceptance criteria (whole feature)

- Walk/stop works via button and spacebar in random walk; spacebar is inert in keyboard mode (and ascend still works there).
- Now-playing card always reflects the closest tree; tapping it expands the list; tapping a row pulses the corresponding tree on the minimap.
- Audibility bars are non-zero only for trees within `DIST_ACTIVACION`.
- Mode pill at top-right shows the current mode and a status dot; clicking opens a popover listing only available modes; selecting a mode swaps engines without breaking audio playback.
- Settings popover provides master volume that affects all trees.
- After 3s idle, the HUD chrome fades to ~10% opacity; any input restores it. Pointer-lock mode (cursor hidden) still works.
- All controls are reachable on mobile (44px touch targets minimum).
- Site still serves cleanly via `npm run serve` (`python3 -m http.server 8000`) — no build step required for the source.
- Keyboard mode still requests pointer lock and shows the existing escape hint.

## 9. Out of scope / future

These are intentionally deferred. Note them but don't implement.

- Hand tracking / head tracking engines (the design diagram references them as future extension points; the mode contract supports them but no implementation now).
- Per-track metadata pages (artist bio, link to bandcamp). The "+11 more" footer in the expanded list is just text in this iteration.
- Search / filter inside the nearby-trees list. With 13 trees this is overkill.
- Long-press on a row to "pin" a tree as a navigation target. Tap-to-pulse is enough to start.
- Persistent user preferences. Volume, last mode, etc. resetting on reload is fine for now.
- Replacing the existing minimap canvas with a higher-fidelity render. The canvas works.
- Localization beyond Spanish. Copy stays in es.

## 10. Open questions for the user

Before starting Phase 1, the agent should confirm with the user:

1. **Keyboard binding for ascend.** Current `Space` = ascend in keyboard mode. The plan recommends keeping that and skipping the global walk/stop spacebar shortcut while in keyboard mode. Confirm.
2. **Artist field source.** The plan asks the agent to populate `artista` per tree by reading `arboles/` filenames. The user should review the proposed mapping for ambiguous entries (e.g., `Cuarto Oscuro_Ronnie Bassili_Nébula_2025` — is the artist "Cuarto Oscuro" or "Ronnie Bassili"?).
3. **Empty state copy.** When no trees are in the audible range, what should the collapsed card say? Options: `"todo en silencio"`, `"acercándote a..."` (showing the closest out-of-range tree), or hide the card entirely.
4. **Gyroscope feature flag.** Confirm that Phase 4 ships behind `?engine=gyroscope` until tested on real devices.

## 11. Testing

The repo has no automated tests. For each phase:

- Manual test in Chrome on desktop (random walk + keyboard).
- Manual test in Safari on macOS (random walk).
- Manual test in Safari on iOS and Chrome on Android (random walk on mobile, gyroscope in Phase 4).
- Verify no console errors during a 5-minute random walk session.
- Verify audio doesn't stutter when the mode changes mid-session.
- Verify the audibility-bar reordering doesn't trigger layout thrash (Performance tab, no long tasks).

If automated tests are added later, the `now-playing.js` audibility math is the most natural unit-test target — it's pure.
