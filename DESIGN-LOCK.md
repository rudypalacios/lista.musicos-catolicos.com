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
| **Lists screen** | Flat rows with no cards: the starred lists first under "Destacados" with a small yellow drawn star (by title), the rest under "Recientes" (most recently edited first), a title search, a small yellow star after the details of a starred list ("10 cantos ★"; the day of a list is not shown), a "⋯" of 44px on each row (it opens a sheet with what is done to that list: star it, duplicate it, **share it by a link** ("Compartir listado", before the red one; unlocked by the owner on 2026-11-01), and last, in red and set apart, delete it, which asks first in a dialog drawn by the app), "＋ Nuevo" (it opens a sheet, "Selecciona una plantilla": the person's templates, the one used last first, "En blanco" and, last and set apart, "Administrar plantillas", which opens a screen that hangs from Listados; touching a template makes the list and opens it; unlocked by the owner on 2026-10-31). | `web/src/views/lists.ts`, `web/src/views/template-choices.ts` |
| **Inside a list** | The layout of the setlist screen: the title edited in place with the "⋯" in the corner at its right, and under it one row: the count of songs and, at the right, "▶ Cantar" (the day of a list is kept in the data but not shown or edited here: the owner took it out on 2026-10-31) (the "⋯" is always there, even with no songs; its sheet opens with "Secciones del listado" (which sections the list has: a switch for each, on its own screen that hangs from the list), then **"Compartir listado"** (a link anyone can read, with no account; unlocked by the owner on 2026-11-01), then prints, only while the list has songs, and last, in red and set apart, deletes the list after the same question as the lists screen; unlocked by the owner on 2026-10-31, and for the sections the same day); each section of the list (the Mass's parts, or the ones its template gave it) as a band with its way to add a song in the head; one line per song (title, "Autor · key" with the key in the blue of the chords, amber when it is not the song's own, and a "hoy" pill beside the key when it is a key of today that was not saved; the owner asked for the blue on 2026-10-31), **no mark before a song, only the indent**; touching a song sings it from there, **holding it lifts it to move it inside its section** (the row floats under the finger and a line shows where it lands; the owner unlocked this on 2026-10-31) (a "⋯" per song for the rest: its sheet sings from there, "Editar" (straight to the song's editor, which comes back to the list), one **"Mover"** that opens a submenu with "Subir", "Bajar", "Al inicio" and "Al final" of its section (the owner asked for it on 2026-11-01), and removes it); empty sections as a dashed outline; the songs whose section the list does not show are under "Otras secciones"; two columns on a wide screen; the gap of 1.15rem between parts and rows of 3.5rem. | `web/src/views/setlist.ts`, `web/src/drag-reorder.ts`, `web/src/views/sections.ts`, `.slot*` / `.item*` in `styles.css` |
| **Singing** | The whole singing screen: no bar and no menu, its own floating bar (back, part and song, position button, "⋯"), the song that follows the finger, swipe and buttons, the sheet behind "⋯" with **Tono** (− / + move the key for today only, "Guardar" leaves it in the list and its arrow offers "como mi tono" too) **Letra** (the lyrics tools) and "Editar letra y acordes" (comes back to singing); no note and no account in it (the owner removed them: Ajustes and Salir are on the list screen's menu); the folded strip with the song and its key, in amber when the key is only for today. | `web/src/views/perform.ts`, the parts of `web/src/views/reader.ts` it uses |

Everything not in the table is not locked, but it keeps the same look and the standards below.

## Standards that hold everywhere

- **It looks the same on every device.** No icon, mark or symbol drawn by the device's font (a
  `▪` or `♪` typed as text varies by device and OS; neither do `←`, `▾`, `＋`, `−`, `✓`, `✕`, `★` or `→`): shapes are
  drawn with CSS or SVG, as in `web/src/icons.ts`. A new icon is added there, never typed.
- **"More options" is one icon: three dots one above the other, drawn (SVG, `more` in `web/src/icons.ts`)** on every
  screen (the bar of singing, the head of a list, the rows of the lists and of the songs). It is never typed as a character.
- **Spacing is in `rem`**, in the steps the app already uses; do not introduce pixel values.
- **Touch targets of at least 44px** for what is pressed.
- **A song looks the same wherever it is listed** (Cantos, the picker of a part, inside a list): the title, under it "Autor · key", the key in blue
  (amber inside a list when it is not the song's own). The picker also shows the first lines of the lyrics under it, to tell songs apart.
- **One way to do each thing in one place:** one "back", one name per screen.
- **Never a blank screen, never a silent wait** (`CLAUDE.md`).

## What counts as a change

Locked: moving, adding or removing an element, renaming a label, changing an icon, a colour, a size
or a spacing, changing the order of things, changing what a touch does.

Not a change: a bug fix that leaves the screen looking and behaving as described here, and work
under the surface (tests, performance, the data, the API) that does not alter what is shown. When in
doubt, ask.
