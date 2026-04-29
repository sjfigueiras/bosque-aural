# Now-playing UI — implementation handoff

Goal: implement the nearby-trees / now-playing panel as a separate branch from the HUD work, without mixing it into the current walk/stop + mode/settings pass.

## Stash to recover

The now-playing work was split out into:

```sh
git stash list --date=local | rg "split: now-playing UI"
```

Current stash SHA at split time:

```sh
e65379808c37bc44172304c34096895a8903c562
```

Important: do **not** use `git stash pop` blindly. Because the split happened from a dirty branch with staged work, the stash object also records surrounding WIP metadata. Recover only the now-playing paths/hunks listed below.

Recommended recovery flow:

```sh
git switch -c feature/now-playing-ui

# If the stash index changed, resolve it by message first:
STASH_REF=$(git stash list | rg "split: now-playing UI" | sed 's/:.*//')

# Restore the standalone component.
git restore --source="$STASH_REF" -- now-playing.js

# Restore the integration files, then review the diff before committing.
git restore --source="$STASH_REF" -- constants.js index.html main.js styles.css

git diff
```

After restoring, inspect the diff and keep only the now-playing-related changes:

- `constants.js`
  - Add `artista` to every `ARBOLES` entry.
  - Add the artist-mapping review comment.
  - Add `NEARBY_LIST_MAX_VISIBLE` only if used by the component.
  - Keep existing HUD constants from the base branch.
- `index.html`
  - Add only `<section id="now-playing" hidden></section>` inside `#hud-overlay`.
- `main.js`
  - Import `createNowPlaying`.
  - Instantiate it after HUD setup.
  - Call `nowPlaying.update({ listener: movementState.position })` inside `frame()`.
  - Add `bosque:pulse-tree` handling and minimap pulse drawing.
  - Do not reintroduce unrelated mode pill, idle fader, settings, or walk/stop code if those already exist on the base branch.
- `styles.css`
  - Add only `#now-playing`, `.np-*`, and mobile now-playing rules.
  - Do not duplicate existing HUD, mode pill, settings, or walk/stop styles from the base branch.

## Component behavior

Implement `now-playing.js` as a vanilla ES module:

```js
export function createNowPlaying({ container, arboles, distActivacion, escala = 1 }) {
  return { mount(), update({ listener }), destroy() };
}
```

Expected behavior:

- Build the DOM once in `mount()`.
- Keep one persistent row per tree.
- In `update()`, compute:
  - distance from listener to tree position, using `pos * ESCALA_POSICIONES`
  - `audibility = clamp(1 - distance / DIST_ACTIVACION, 0, 1)`
  - `inMix = audibility > 0`
- Sort by descending audibility, tie-break by original index.
- Reorder rows via `transform: translateY(...)`, not DOM moves.
- Update only row classes, transform, audibility fill width, and collapsed card text in the hot loop.
- Hide the whole card when no tree is audible.
- Clicking a row dispatches:

```js
document.dispatchEvent(new CustomEvent('bosque:pulse-tree', {
  detail: { index }
}));
```

## Acceptance checklist

- Collapsed card shows the dominant audible tree and current in-mix count.
- Card expands/collapses on click.
- Rows reorder smoothly as listener position changes.
- Audibility bars are non-zero only within `DIST_ACTIVACION`.
- Out-of-range rows are dimmed and have no visible bar.
- Dominant row has subtle green tint and animated EQ bars.
- Clicking a row pulses the corresponding minimap dot without interrupting movement.
- No console errors during random walk or keyboard mode.
- `npm run build` passes.

