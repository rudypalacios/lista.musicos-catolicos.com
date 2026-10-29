# Locked design

Parts of the interface the owner has settled. **They are not to be changed** (look, structure,
order, wording, icons, spacing, behaviour) by any session unless the owner asks for it in
that session, in so many words. A flow review comes next (see `TODO.md`, "Next: flow review"); it
works around these parts and does not reopen them.

If a task seems to need a change here, stop and ask the owner first, say what would change and
why, and wait. When the owner unlocks something, change it and update this file in the same PR.

## What is locked

| Part | What is settled | Where |
| --- | --- | --- |
| **Bar and sync** | A bar that says the name of the screen, or on a screen that hangs from another one a single "← parent"; a sync dot at its right (green and silent when all is sent, amber while something is about to go, pulsing while it syncs; touching it syncs now); a line under the bar only when there is no connection, the session ended, a sync failed or a record was refused. The name of a screen is not repeated anywhere else (the heading stays hidden for screen readers). | `web/src/views/header.ts`, `web/src/sync-line.ts`, `parentOf` / `titleOf` in `web/src/router.ts` |
| **Menu** | Cantos, Listados, Ajustes. Fixed at the bottom of a phone on every screen but singing; a rail at the left from 900px, with the email and Salir at its foot. The account (email, Salir) is a block at the end of Ajustes. Messages that float over the screen rest above the menu and the install bar; the screen pulled down to sync never paints over the menu. | `header.ts`, `web/src/bottom-chrome.ts`, `.menu` / `.shell` in `web/src/styles.css` |
| **Lists screen** | Flat rows with no cards: the starred lists first under "★ Destacados" (by title), the rest under "Recientes" (most recently edited first), a title search, a 44px star on each row, "＋ Nuevo". | `web/src/views/lists.ts` |
| **Inside a list** | The layout of the setlist screen: the title edited in place, the day as a chip, "▶ Cantar" and "⋯"; each part of the Mass as a band with its way to add a song in the head; one line per song (title, "Autor · key"), **no mark before a song, only the indent**; a "⋯" per song; empty parts as a dashed outline; two columns on a wide screen; the gap of 1.15rem between parts and rows of 3.5rem. | `web/src/views/setlist.ts`, `web/src/mass.ts`, `.slot*` / `.item*` in `styles.css` |
| **Singing** | The whole singing screen: no bar and no menu, its own floating bar (back, part and song, position button, "⋯"), the song that follows the finger, swipe and buttons, the sheet behind "⋯" with the tools and the account (no note field: the owner removed it). | `web/src/views/perform.ts`, the parts of `web/src/views/reader.ts` it uses |

Everything not in the table is not locked, but it keeps the same look and the standards below.

## Standards that hold everywhere

- **It looks the same on every device.** No icon, mark or symbol drawn by the device's font (a
  `▪` or `♪` typed as text varies by device and OS): shapes are drawn with CSS or SVG, as in
  `web/src/icons.ts`.
- **Spacing is in `rem`**, in the steps the app already uses; do not introduce pixel values.
- **Touch targets of at least 44px** for what is pressed.
- **One way to do each thing in one place:** one "back", one name per screen.
- **Never a blank screen, never a silent wait** (`CLAUDE.md`).

## What counts as a change

Locked: moving, adding or removing an element, renaming a label, changing an icon, a colour, a size
or a spacing, changing the order of things, changing what a touch does.

Not a change: a bug fix that leaves the screen looking and behaving as described here, and work
under the surface (tests, performance, the data, the API) that does not alter what is shown. When in
doubt, ask.
