# To do

What is left. Tick an item when it is closed (`[x]`) and delete it once there is no need to
remember it.

## Where things stand

Phases 0 to 5 are written and merged (songs, setlists, print, the quiet usage fixes and Ajustes), and the
interface is settled: the bar and sync dot, the menu, the lists screen, the inside of a list and singing are
**locked** (`DESIGN-LOCK.md`: not to be changed unless the owner asks in that session). Phase 7 (ChordPro) is done; phase 6
(sections, templates and tags) is under way, one PR at a time (see its item below).

Open elsewhere (owner to merge): `musicos-catolicos` [#42](https://github.com/rudypalacios/musicos-catolicos/pull/42)
and `mc.musicos-catolicos` [#43](https://github.com/rudypalacios/mc.musicos-catolicos/pull/43): PHP 8.3 only, and the
tests run only when called or by hand (the free Actions minutes ran out).

## Next: flow review (its own session)

The screens are settled; what is left to weigh is how a person gets through them. Walk each flow from the
person's side (on the phone first, then the tablet), find where it takes more steps, asks for something it
already knows or leaves the person unsure, and **propose** fixes: nothing is changed before the owner approves
the list, and nothing in `DESIGN-LOCK.md` is touched unless the owner unlocks it. Flows to walk:

- Preparing next Sunday: create a list (or copy last Sunday's: "copiar listado" is paused, see below), add songs
  to each part, change a key, check it, sing it.
- Adding songs: one at a time per part today (a round trip per song), from the library, by import, by writing one.
- Changing a key: only while singing today ("Cantar desde aquí"); decide whether it should also be possible from
  the list or the song's sheet.
- At the church with no connection: open, find the list, sing, go back, what the dot says.
- Leaving and coming back: where the app opens, what it remembers, signing out and in.
- Settings and account: Ajustes and Salir are two taps away since the menu.

Candidates already noted: the key only while singing; duplicating a list; the order and wording of the sheets;
adding several songs to a part without leaving the picker; moving a song to the start or the end of its part;
dragging to reorder (phase 6).

## Compatibility shims (what is kept, and why)

The owner has real data in the app (`CLAUDE.md`, "Compatibility with the owner's data"). A shim stays while
something the owner has could break without it:

- `withShift` (`data/library.ts`) and the `Number.isInteger(song.myShift)` guard in `Setlists.addItem`: songs saved
  on a device before "mi tono" have no `myShift` until they change; without the default the song page and the key
  of a new item would be `NaN`.
- `myShift` / `starred` optional on the server (`SongChange`, `SetlistChange`, the `COALESCE` in both repositories):
  a record queued or saved on a device before those fields is pushed without them, and must keep what is stored.
- `songs` / `setlists` each optional in `PushAction` (at least one): an app from before the lists pushes songs only.
- The upgrade of the on-device database (`data/idb-store.ts`, versions 1 → 3: cursor reset). Version 3 also drops the
  lists of the device (the sections, phase 6 PR 1): remove the whole upgrade once every device has opened the new version.
- `partsOf` (`data/setlists.ts`) reads a list with no sections as the Mass instead of an empty screen: a guard with a defined
  default; the server never stores such a list any more (migration `0008`).

Removed (nothing the owner has needs them): `withStar` (a list with no star reads as falsy anyway), `myShift ?? 0`
and `page.setlists ?? []` in `api.ts` (the server always sends both). When the owner confirms every device was
opened after the lists and "mi tono" shipped, the rest can go too.

## Owner's checks (cannot be done from the sandbox: Safari, real devices, the host)

**Deferred to the end of all the phases:** every iPad check below waits until then, when Claude writes
the owner one complete list of what to try on the iPad. Until then only the Android is tested.

- [ ] On the iPad and the Android, installed (`DEPLOY.md`, "Pruebas en los dispositivos", "Cantos (fase 1)"
      and "Listados (fase 2)"): write a song offline, reload, sync; fit-to-screen on the iPad and the
      phone; import the real PDF and see how it lands; the "Descargando… / Hay una versión nueva /
      Actualizando…" flow after a deploy; the 8-day test that a home-screen app keeps its songs.
- [ ] **Phase 2, on the iPad and the Android:** build a list, change a key, sing it (swipe, buttons),
      go offline and sing it again, see it on the other device; delete a song that is in a list.
      Safari's touch events (swipe) and the date field are the parts only a real iPad can confirm.
- [ ] After the deploy, check the tables are `utf8mb4` (migrations `0003` and `0005`; `DEPLOY.md`,
      "Comprobar el primer deploy", step 3), `setlists` included.
- [ ] After a squash merge, delete the work branch: its early commits hold fragments of real lyrics
      (the squash commit of #3 on `main` still does; rewriting `main` is the owner's call).

## Small things to do when convenient

- [ ] Tune the fit limits (`DEFAULT_LIMITS`, `COMFORTABLE_SIZE`, `TWO_COLUMNS_GAIN` in `web/src/fit.ts`) after seeing it on the devices.
- [x] **Reading colours: lyrics and chords as one pair** (`settings.ts`, `views/settings.ts`; the owner approved the mockup): the "Color de la letra" list became four cards
      with a sample each (Clásico, Blanco y rojo, Ámbar y celeste, Verde y rosa), applied as `--lyric-color` / `--chord-color` through the CSSOM (the page's policy refuses
      `style` attributes: the old colour circles were empty in production, which this replaces). Every pair has contrast ≥ 7:1 on the app's background (`web/test/settings.test.ts`).
      Paper stays fixed (black lyrics, dark red chords; e2e under print media). **Decided with the owner:** no free colours (contrast cannot be guaranteed; if ever wanted, a
      picker that rejects what does not read) and no separate colours for paper (the same cause as the white-lyrics PDF bug). Stored ids: `predeterminado`, `blanco`, `ambar` and `verde`
      keep their lyrics; `celeste` reads as the default (nothing breaks). **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 37.
- [x] **The lyric colour never reaches the paper** (`print/print.css`): a colour chosen in Ajustes (white, for a dark screen) made the printed lyrics vanish;
      on paper `#print-root .song-sheet` is always black. Checked by `tests/e2e/print.ts` under print media. **Owner's check:** `DEPLOY.md`, item 11 (print).
- [x] Keep the screen awake while a song is open or a list is being sung (Screen Wake Lock, `web/src/wakelock.ts`;
      on by default, an Ajustes choice turns it off). **Owner's check:** Android and iPad (Safari 16.4+; a
      home-screen app only from iOS 18.4), see `DEPLOY.md`.
- [x] A song missing from the picker of a part is written right there: with text in the search the picker offers
      "Crear «texto»" (or "Crear canto nuevo" with an empty library); the form opens with the title typed, and
      saving puts the song in that part and returns to the list (`paths.new(into, title)`, `Route` `new`,
      `editView`'s `start`). Importing from the picker is not offered: a PDF can hold several songs and they do
      not all belong to one part. **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 13.
- [x] The picker of a part tells songs apart before adding: each row shows the first two lines of the lyrics
      (no chords or labels, one row each, cut with "…"), and an eye (44px, `icons.ts`) opens a sheet with the whole
      song in the person's notation and "Cerrar" / "Agregar a …" (`views/add.ts`, `songSnippet` in `search.ts`).
      Search now also reads the lyrics (title and author matches first; a song found only through its lyrics shows
      the lines that matched, also on Cantos). No highlight of the matched words on purpose: showing the matching
      line does the job with no offset mapping across accents. Not added: searching inside the key or chords.
      **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 14.
- [x] The key of a song in a list (PR 1 of 3, the owner's design: `maquetas del tono`): in Cantar's "⋯" sheet, **Tono**
      (`views/tone-control.ts`): − / + move the key **for today only** (kept on the device in `today-keys.ts`, never synced,
      expiring at 5 in the morning, surviving a reload) and **Guardar** leaves it in the list; "Listado Fa" goes back to the
      saved key. The row of the list shows "hoy" beside a key of today and the folded strip shows it in amber. The sheet
      is Tono + Letra only: Nota (already gone), Pantalla, Ajustes and Salir left it; a screen lock that fails now says so
      with a toast. **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 15.
- [x] The key of a song in a list, PR 2 of 3: **"mi tono"** (`Song.myShift`, migration `0007`, synced; 0 is the written key, the
      same as none): a song added to a list starts in it (copied to the item, not followed). "Guardar ▾" in Cantar offers
      "Solo hoy / En este listado / Como mi tono / En el listado y como mi tono" and the line under it says "Mío Re"; the song
      page in Cantos has the same control (compact: the line shows only while there is a change) with "Guardar como mi tono", and
      the song opens in it (the address carries `?t=` only when the key is not the person's own). **Owner's check:** `DEPLOY.md`
      "Fases 4 y 5", item 16.
- [x] The key of a song in a list, PR 3 of 3: **touching a row sings it from there** (a button, no longer nothing), and **"Editar
      letra y acordes"** at the end of Cantar's "⋯" sheet (`/cantos/:id/editar?volver=…`, which comes back to Cantar). The edit
      screen says in one line "Está en 3 listados" and, when the edit moves the song's written key, "El tono original pasó de
      Do a Re" (each opens its text with an info button). **Rule:** editing a chart never changes what is sung: when the written key
      moves, "mi tono" (if set), every use of the song in a list and the keys of today move the other way (`keys.ts`,
      `Setlists.retuneSong`, `App.updateKeepingKeys`). A song with no key (no chords, no `{key}`) is never retuned.
      **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 17.
- [x] A chord typed in lowercase (`[c]`, `[am]`, `[bb]`, `[g/b]`) is capitalised by the editor when it previews and
      saves (`chordpro/capitalise.ts`), so it is read as a chord without the person fixing the case; the parser is not
      touched (as the public site's). A bracket that is not wholly a chord (`[bis]`, `[x2]`) stays as written.
      **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 18. The Cantar sheet also gives its "Editar letra y acordes" room
      above and below its line.
- [x] The lists screen: the star of each row became a "⋯" that opens a sheet (`views/lists.ts`) with "Destacar" / "Quitar de
      destacados" and **"Duplicar listado"** (`Setlists.duplicate`: a copy with the title "Copia de …" and no day, the songs in
      their parts and order and the key each has in the list; no star, no notes, songs deleted since left out; it opens at once and
      a toast says where it came from). The sheet is where sharing and other per-list actions will go. Not done: copying from
      "＋ Nuevo" (the owner chose the row's sheet), an undo for the copy ("Eliminar listado" is in the same sheet).
      **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 19.
- [x] "More options" is one drawn icon, three dots one above the other, on every screen (owner's choice; Cantar's bar no longer
      types a character). **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 20.
- [x] A starred list shows a small yellow star (drawn, `--star`) after its details on the lists screen ("10 cantos ★"),
      so the yellow is seen without opening the sheet. **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 21.
- [x] Every icon is drawn (SVG, `icons.ts`), none typed: the back arrows, the "＋" of "Nuevo" and "Fecha", the − and + of the key
      and of A− / A+, the arrow of "Do → C", the check of "App actualizada", the ✕ of the install bar, the chevron of the
      position button and the star of "Destacados" (yellow). In the lists sheet "Destacar" shows an empty grey star and
      "Quitar de destacados" the filled yellow one. The reader's old key group (− / key / +, only used before `externalTone`)
      is gone. Back links are named "Volver a …" for screen readers (their text is still the name of the screen).
      **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 22.
- [x] **"Guardar" does what is marked** in the arrow's menu (`views/tone-control.ts`): touching an option only marks it (it starts on
      "En este listado"; the mark is forgotten when the change goes), and "Guardar" does the marked one. With "Solo hoy" marked it
      writes nowhere and says "Queda solo para hoy". The look of the menu is unchanged. **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 16.
- [x] **A copy of a list is "Copia de …" with no day** (`copyTitle`; a copy of a copy keeps one "Copia de", and a long name is cut to
      the limit), and a day could be removed from a list (**superseded: the day is no longer shown inside a list**): a "✕" of 44px (`Quitar la fecha`) beside the day chip, only while there is
      a day (a date field cannot always be emptied by hand, e.g. on an iPad). The day was already optional in the model;
      "＋ Nuevo" still starts for today. **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 24.
- [x] **"Eliminar listado" moved to the lists screen**: it is the last action (red, set apart) of the row's "⋮" sheet, and it
      asks first with a dialog drawn by the app (`views/confirm-dialog.ts`: "Cancelar" is the focused answer, Escape, a touch
      outside and the back button also cancel) instead of the browser's `confirm()`, which looks different on each device. A
      toast says "Listado eliminado". It is gone from inside a list, whose "⋮" now only prints (so it is hidden while the list has
      no songs; **superseded by the next item**). **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 23.
- [x] **Delete a list from inside it too** (the owner unlocked the "Inside a list" row for this, `DESIGN-LOCK.md` updated): the list's "⋯"
      is always shown (it used to hide with no songs) and sits in the corner beside the name; under it one row with the count
      and a smaller "Cantar" at the right. **The day is no longer shown or edited inside a list** (the owner: not needed for now); it is
      still stored, so it can come back, and **the lists screen's row no longer shows it either**; the chip and its "✕" are gone. Its sheet prints only while there are songs and ends with "Eliminar listado" (red, set apart),
      which asks with the same dialog as the lists screen (`views/delete-list.ts`, shared) and goes back to Listados.
      **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 29.
- [x] **Cantos like Listados** (the owner's mockup; `views/list.ts`): search, Importar and Nuevo canto in one row (the search alone on a phone),
      "N cantos" under it, flat rows in one column (title, "Autor · key", "⋯"; touching a song opens it), and a sheet with "Editar letra y
      acordes" and "Eliminar canto". Deleting a song (here and from the edit screen) asks with `confirmDialog` and names the lists it is in
      (`views/delete-song.ts`); the browser's `confirm()` is gone there. Signing out with unsent changes (`signOut`, in `main.ts`) asks with `confirmDialog` too (`DEPLOY.md` "Fases 4 y 5", item 32): no `confirm()` is left in the app.
      **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 30.
- [x] **New song, PR A of the review** (`views/edit.ts`, `views/import.ts`): a missing title is said at the title field (marked,
      focused, message under it) and no longer at the foot of the form; a song saved with no lyrics says so in a toast (allowed: a
      title first, the lyrics later); a **repeated title is neither warned nor blocked** (the owner: several "Santo" and "Gloria"
      exist); Importar draws its own "Elegir PDF" button instead of the browser's, with a shorter explanation; the import cards
      capitalise a lowercase chord (preview and save) like the editor. **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 25.
- [x] **Import from a photo or a screenshot** (`web/src/ocr/`, `views/import.ts`; the owner approved the mockup, version A: three cards, no tabs): "Importar" has two more cards,
      **Tomar fotografía** (the camera; hidden where the pointer is a mouse, so on a computer) and **Cargar imagen** (the gallery; a file can be dropped on it from a computer), with a note under
      them ("Mejor con acordes impresos…, los escritos a mano también se intentan leer, pero sin garantía de calidad"). The picture is read **on the device** by Tesseract (WebAssembly in a worker of this
      origin, Spanish data; nothing is sent anywhere, so the privacy text is unchanged): once for the letters and once with an alphabet of only what a chord is made of, and `words.ts` puts them together (it
      straightens the page by the baseline of its lines, drops the noise the first reading leaves in the chord rows, reads a stray low-confidence letter above the lyrics as the C the second pass missed, sets a title
      across two columns apart) before the PDF's own layout puts each chord on its syllable. The review shows "Leído de una imagen. Revisa los acordes…". Measured on the owner's three photos (not in the
      repo): printed chords come out almost all right (a sheet in two columns with a decorated background: every chord but one), a screenshot with printed chords is good, and chords written by hand in pen
      mostly are not read (the lyrics are). **Known limits:** sharps (`#`) are often lost, a sheet turned 90° is not turned back, the reader (~6 MB: engine + language data) is not kept for offline use (like the PDF
      reader), and the policy in `public/.htaccess` now allows `wasm-unsafe-eval` (the only widening). **Not done on purpose:** a model of vision on a server (not free, and it would send the photo to a third party). Public
      use would not cost anything per person (it runs on each device). **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 45 (the iPad at the end: Safari must accept `wasm-unsafe-eval`; if it does not, the card must say so).
- [x] **Share a list by a link** (`src/Share/`, migrations `0012` and `0013`, `web/src/views/shared.ts` and `share-sheet.ts`; the owner approved the mockup, unlocked the two "⋯" sheets for it
      and chose "cualquiera": the link is public): "Compartir listado" is a new action in the "⋯" of each row of Listados and of the list itself. Its sheet has a switch **"Incluir letra y acordes"**
      (on by default, with the notice that the words belong to their authors), "Crear enlace" and, once shared, the link (to copy, or "Compartir…" where the phone has its own), the same switch (it applies at
      once, the link stays) and "Dejar de compartir" (asks first; the link dies for good, sharing again makes a new code). Anyone with the link reads the list at `/c/:code` with no account, in
      the look of the public site (its header, footer, tracks list and lyrics; no menu, nothing to edit), opens a song (`/c/:code/:n`), moves the key for themselves and prints. The server's public answer
      carries only the title, the sections shown, the songs in order with the key each has in the list and (if chosen) the lyrics; a stopped, never given, malformed or deleted-list link all answer the same
      404, an address that keeps missing is slowed down (`MissThrottle`), and the answer can be kept a minute with an ETag. The visitor's page has no cookies, analytics or ads and asks for nothing from another
      origin (checked under the production policy). **Left for the owner:** publish the privacy text proposed in the PR in `musicos-catolicos` (Privacidad) and decide whether the lyrics switch stays on by default.
      **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 46.
- [x] **The visitor's page, thin and offline** (`web/src/views/shared.ts`, `shared-store.ts`; the owner approved mockup v6): the page is the same PWA, so it registers the app's service worker
      and **keeps a copy of the list it opens** in a database of its own (`lista-shared`, at most 20 copies, nothing mixed with the person's data): with no connection it opens the copy and
      says "Sin conexión. Estás leyendo la copia guardada el …"; a link found stopped deletes its copy; a list never opened says it needs a connection. The layout gives the lyrics the screen:
      a header of one row (the mark of the site), a list with small titles, the foot of the site **folded away** (a small tab ⌃ at the bottom edge opens it over the page, ⌄ closes it), and a song
      as when singing a list: a thin bar (back, title and place, ‹ ›, the tools button), **the app's own reader** with the lyrics fitted to the screen, the tools (key, size, Do/C, print) **folded
      under the bar** and dropping over the lyrics without moving them, **a swipe** (or ← →) to change song, and no "Siguiente" block. The privacy text proposed in the PR says that a copy of the
      list and the reading preferences stay on the visitor's device. **Left for the owner:** publish that text in `musicos-catolicos` (Privacidad). **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 47.
- [x] **A list from an import** (`web/src/import-list.ts`, `views/import.ts`, `Setlists.createWithSongs`, `createTemplatePickSheet` in `views/template-choices.ts`; the owner approved the mockup; it was first decided against, 2026-11-01,
      and came back once the template was in the middle): next to **Guardar**, **"Guardar y crear listado"** (shown when at least two songs would go in the list: the marked ones and the ones the person already has). It opens the
      same sheet as "＋ Nuevo" ("Selecciona una plantilla": the person's templates, last used first, and "En blanco"; no "Administrar plantillas", it would leave the review). Picking one saves the songs as Guardar does and
      makes the list in **one write** with the template's sections, titled from the template and the day; each song goes in the section whose tag (`tagOf`: the Mass's short tag, or the section's name) is one of its tags, a blank list
      (one section) takes everything in the order of the file, a song the person already has ("Ya la tienes") goes in as their own song (not a copy, and a repeat in the file stands for the first), one unmarked on purpose goes
      nowhere, and what fits no section is saved but left out of the list (the notice says how many). If nothing fits, nothing is saved and the person is told to try another template ("En blanco"). The list opens and the
      notice offers **Deshacer**, which removes the list and leaves the songs. **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 48.
- [ ] A help page (FAQ) in the app: `faq.md` holds the first notes (the draft of "Nuevo canto"); make it a screen later, in Spanish, reachable from Ajustes.
- [x] **New song, PR B** (`views/edit.ts`, `song-draft.ts`, `importer.ts` `convertPastedSheet`; the owner approved the mockup): "Escribir | Ver"
      above the lyrics on a phone (side by side from 900px), Guardar / Cancelar fixed at the foot, a sheet pasted with chords over the words is
      converted once with "N acordes convertidos" and "Deshacer", and a draft of the new song is kept on the device (`localStorage`, one per
      device, cleared by Guardar, Cancelar, Descartar and sign-out; not used when the song starts from a part's picker). **Owner's check:**
      `DEPLOY.md` "Fases 4 y 5", item 26. Not done on purpose: converting Latin chord names to English on save (the owner has not decided; the
      parser already reads both), "Agregar a un listado" after saving from Cantos.
- [x] **Import review, in rows** (`views/import.ts`, `import-review.ts`, `attentionOf` in `importer.ts`; the owner approved the mockup): pasting converts at
      once; one row per song (mark, title, "N acordes · M líneas"), flagged only with what needs a look (`attentionOf`: Sin acordes, Dos columnas,
      Acordes sin letra, Cejilla; the report of chords written in the standard form is not one of them); a song with no title shows its field in the row with
      "Título requerido" and a suggestion under it (the first line of the lyrics); Guardar at a fixed foot, blocked while a marked song has no title; a song
      with the same title and text as one held starts unmarked ("Ya la tienes"). Measured on the owner's four PDFs (not in the repo): 12 songs went from 5673px
      to 2040px. The PDF reader message says a connection is needed every time (it is not cached). **Left out on purpose (the owner):** creating a list from
      an import (revisit with the templates, phase 6, since not every list is a Mass) and reading titles and authors by their layout in the PDF headers.
      **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 28.
- [x] **Import, the file and the tabs** (`views/import.ts`, `import-review.ts`, `pdf/read.ts` `onProgress`; the owner approved the mockup): "Elegir PDF" is a card
      with the `upload` icon (drop a file on it from 900px), the chosen file shows its name, pages, size and a bar that fills page by page
      ("Leyendo página 2 de 4…", then "Listo" and "Cambiar PDF"; new icon `file`), the PDF's text is no longer poured into the paste box, each open row has
      **Letra con acordes | Vista previa** opening on the preview, and a song repeated inside one import ("Repetido", `repeatedInBatch`) starts unmarked.
      **Decided with the owner:** the PDF reader (about 1.7 MB: chunk 0.49 + worker 1.24) is **not** kept for offline use; the message says reading
      a PDF needs a connection and pasting does not. Pasting stays (offline, text from Word or the web, fixing by hand); only the "Convertir" button is now
      secondary. Nothing about privacy changes (the PDF is still read on the device). **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 34.
- [x] **The song page: one row of tools, the rest behind "⋯"** (`views/view.ts`, `reader.ts`, `tone-control.ts`; the owner approved the mockup): the key
      (− Do +), A− / A+ and "⋯" are one row above the lyrics (a second line shows only while the key is changed, with the same "Guardar ▾" as singing: "Solo por ahora" / "Como mi tono");
      the "Tono Do" pill is gone from the head (`keyPill: false`; singing keeps it); the sheet of "⋯" has **Letra** (notation, fit, columns: `reader.display`)
      and **Este canto** (print with chords / lyrics only, "Editar letra y acordes", and last, red and set apart, "Eliminar canto", which asks first
      and goes back to Cantos). The loose "Imprimir" (`print-menu.ts`) and "Editar" buttons, `.viewer__bar` and the old overrides of the tone control
      inside `.toolbar` are gone. **Next, its own PR:** "Agregar a un listado" in this sheet (pick a list and a part). Not touched: the "C → Do" of singing
      (locked; the owner may ask to change it). **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 35.
- [x] **Add a song to a list from its page** (`views/add-to-list.ts`, the owner approved the mockup): "Agregar a un listado" is the first action of the song
      sheet; its own sheet has two steps, the list (starred first, "Nuevo listado" at the end) and the part of the Mass (counts, "opcional", "Ya está aquí");
      touching a part adds the song at its end (`Setlists.addItem(…, transpose)`), closes the sheet and says where. The song goes in the **key on screen** when it is
      not "mi tono" (the sheet says "Entra en Re"). Depends on #50 (the song page's sheet). **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 36.
      **Phase 6 did all of this:** the second step lists *that list's* sections, `addItem` validates against them (PR 1) and "Nuevo listado" in this sheet
      asks which template (PR 3).
- [x] **New song / edit song on a wide screen** (from 900px, `views/edit.ts`, `styles.css`): "Vista previa" is titled outside its box like "Letra con
      acordes" and the two boxes are level; Guardar / Cancelar keep their size at the right, level with "Eliminar" (the same button, moved into the foot
      while the window is wide; a new song has none). The phone is unchanged. **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 31.
- [x] **The picker of a part lists songs like Cantos** (`views/add.ts`, `styles.css`): flat rows, the title, "Autor · Do" under it (the key a little brighter),
      the eye at the end (blue, it reads the song); the first lines of the lyrics still show under it to tell songs apart, and "Ya está aquí" goes in the
      detail line. The cards and chips it had are gone. **Rule (the owner):** a song looks the same wherever it is listed. **Owner's check:** `DEPLOY.md`
      "Fases 4 y 5", item 33.
- [ ] Adding several songs to one part takes a round trip per song (the picker returns to the list).
      If that is slow in practice, let the picker stay open and show what has been added.
- [ ] **Paused (owner, after the UI session).** Duplicate a list ("copiar listado") to start next Sunday's from this
      Sunday's (the "Nuevo listado" sheet with "copy of the last one" was sketched with the owner; no schema change).
- [x] The setlist screen (`views/setlist.ts`), lighter: flat sections, one line per song (title, "Autor · key"),
      a song is not a link here (touching its title does nothing; it is opened by singing from it), a "⋯" per song (sing from here, move up/down within the part, remove with an
      "undo"), a compact header (title edited in place and growing, the day as a chip, "▶ Cantar", and a "⋯" with
      print and delete), an empty part as one line, two columns in the order of the Mass on a wide screen. The key is
      no longer changed here (it is changed while singing, which saves it to the list item); it is shown to read, in
      amber when it is not the song's own. The app's own icons are in `web/src/icons.ts` (Simple Icons is for brand
      logos only and has none of these). Adding a song is always in the head of the part (words while it is empty,
      a "+" once it has songs, and from the fourth song also one at the end: `ADD_AT_END_FROM` in `setlist.ts`).
      The head of a part is a band, a song has no mark, only the indent of its row (a dash, a square, a dot, a note and a bar were weighed with the owner; the marks that depend on the device's font were ruled out: everything must look the same on every device), empty parts are a dashed outline, and the gap between
      parts is 1.15rem (the rows keep their 3.5rem: they are what is touched).
      Owner's check: `DEPLOY.md` "Fases 4 y 5", item 11.
- [x] Dragging a song to reorder it, and "al inicio / al final" (phase 6, PR 6, above).

## Phase 2: setlists (done, awaiting the owner's devices)

- [x] Mass template from `MASS_PARTS` (`web/src/mass.ts`): every part is a slot, five are marked
      "opcional", and the sign of peace has its explanation behind a visible ⓘ button.
- [x] One or several songs per part; key per item (semitones, −11…11) **for that list only**; order within the part; at most 80 items and 60,000 bytes of items per list.
- [x] A list is one record with its items inside, in the same store, queue and sync as songs, with one
      change counter for both (`Sequence`, `ChangeFeed`; `GET`/`POST /api/sync` carry `songs` and `setlists`).
- [x] Screens: `/listados`, `/listados/:id`, `/listados/:id/agregar/:part`, `/listados/:id/cantar/:n`, and
      the "Cantos | Listados" tabs. The song reader (`views/reader.ts`) is shared with the song page.
- [x] Deleting a song that is in lists asks first and names them; the lists then show "Canto eliminado".
- [x] IndexedDB version 2 (`setlists`, `pending-setlists`); upgrading from version 1 keeps the songs and
      the unsent queue and pulls everything again once, because a version-1 cursor may have gone past
      setlists it could not read.

## Usage feedback (owner's list, in phases)

Phase 4, quiet and quick (no schema change):

- [x] A toast says a change was saved ("Guardado en este dispositivo", then "Guardado y sincronizado");
      no save button, everything saves as it is typed (`web/src/toast.ts`).
- [x] After picking a song the list opens at that part with the new song marked; "back" from a song
      returns to the same place in the list.
- [x] "Aclamación memorial" explains itself with the ⓘ button.
- [x] The same song in two parts is allowed, with a notice when it is added (not while searching) and on both rows.
- [x] No notes anywhere (owner's call: unused; a capo goes in the lyrics as `{capo: 2}`). The "Nota" field behind "⋯"
      while singing, its dot on "⋯" and `Setlists.setNote` are gone, and the setlist screen showed none already.
      **The data keeps them** (`Setlist.notes`, `SetlistItem.note`, the API and the columns, untouched), so what was
      written is not lost and an old copy of the app still syncs; they are just not shown or edited. Removing the
      fields from the API and the database would be a destructive migration: only if the owner asks.
- [x] Swiping between songs: no browser rubber-band or sideways pull (`overscroll-behavior`,
      `touch-action`), and the next song slides in. **Owner's check on the Android:** the stretch is gone.
- [x] Wide screens: parts in two columns, each song's tools on one line.

Next, in this order (design agreed with the owner):

- [x] Phase 5, settings (this branch): an Ajustes screen per device (chord names, lyric colour,
      fit, columns auto / 1 / 2, keep the screen on); a columns button in the reader on wide screens;
      the Ensayo / Evento modes were dropped: the only difference was whether the note could be edited.
      Singing has one floating bar: a row with back, part and song, the position button (a list of the
      songs to jump to) and "⋯" (a sheet with every tool, the note, Ajustes and Salir); it folds
      to a strip with the title and key while the lyrics scroll down and returns on scroll up or a tap;
      The song follows the finger on a swipe; the lyric size is kept on the device, apart for the library's
      songs and for the lists being sung. The quick pill was tried and removed (the owner prefers just "⋯");
      it can come back later if wanted. A± nudge the size the fit chose. Settings are not synced between
      devices on purpose (a tablet on a stand and a phone want different things); sync them later if
      the owner asks.
- [x] The lists screen, lighter (`web/src/views/lists.ts`): flat rows with no cards, the starred lists first under
      "★ Destacados" (by title) and the rest under "Recientes" (most recently edited first; the day of the Mass no
      longer orders anything, so lists with no day work), a title search, and a 44px star on each row. The star is a
      field of the list (`starred`, migration `0006`) and syncs between devices; an older copy of the app that sends
      no value keeps the stored one. "＋ Nuevo" still creates a list at once. Left out on purpose: a cap on
      "Recientes" with "Ver todos" (the search covers a long list), and "Crear «texto»" from an empty search.
      The "Toca ☆ para dejar un listado arriba" hint was removed on purpose (the owner finds the star natural);
      it can come back if people do not find it.
- [x] Pull down to sync (`web/src/pull.ts`): at the top of a screen, a drag down and let go syncs now and says how it
      ended ("Sincronizado", "Sin conexión", …). It does nothing on a short drag, on a screen that is scrolled, or while
      singing (the stage has its own touches). The automatic sync is unchanged (back to the front, network back, every
      5 minutes while open): the owner saw a change from the web take about a minute to arrive. **Owner's check on the
      Android and the iPad** (`DEPLOY.md`, "Fases 4 y 5", item 10): the browser must not reload the page by itself.
      On a computer with no touch screen the dot in the bar syncs when clicked (see the menu item below).
- [x] The menu and the bar (`views/header.ts`, `sync-line.ts`, `parentOf`/`sectionOf`/`titleOf` in `router.ts`): a menu with
      Cantos, Listados and Ajustes at the bottom of a phone (fixed, on every screen but
      singing; a screen that hangs from another also has one "← parent" in the bar) and as a rail at the left from 900px,
      always there, with the account at its foot. The bar says the name of the screen; the in-screen back links and the
      repeated titles are gone (the title stays as a hidden heading for screen readers). A dot for the sync (silent when
      all is sent; a line under the bar only when there is no connection, the session ended, a sync failed or a record
      was refused; an amber dot, with no line, while something is about to be sent, so the screen does not jump after
      every edit; touching it syncs now). The account (email, Salir) is a block at the end of Ajustes. The install guide
      has numbered steps in round badges. Weighed with the owner: tabs in the bar (merged in #23, replaced by this) and
      "Listados first" (the library becomes secondary). **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 12. The messages that
      float over the screen (saved, sync, update) rest above the menu and the install bar (`bottom-chrome.ts`,
      `--chrome-bottom`), and the screen pulled down to sync is clipped so it never paints over the menu. Open: confirm on the iPad that the menu does not fight the home gesture.
- [x] **Pull to sync starts only at the top** (`pull.ts`): from the top third of the screen (`inPullZone`) and not when the touched element or
      anything above it is scrolled (`scrolledWithin`): a song's stage scrolls inside `#view`, whose own `scrollTop` stayed 0, so dragging down at the
      bottom of a long song began a sync. **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 10.
- [ ] **Owner's check on the Android** for phases 4 and 5 (`DEPLOY.md`, "Fases 4 y 5", item 9 for the lists screen).
- [ ] **Phase 6, sections, templates and tags** (the owner approved the plan and mockups on 2026-10-31; the person reads "sección",
      the code says "part"). A list carries its own sections (`Setlist.parts`, the Mass is the template a new list starts from);
      templates are a synced collection; tags are on songs. The owner's decisions: the Mass is one template among others; "＋ Nuevo"
      asks which template (the last used first; with one template it creates at once); "Administrar plantillas" is the last action of
      that sheet (a screen that hangs from Listados, not in Ajustes); tags go **below the lyrics**, optional; no compatibility with old
      versions (`CLAUDE.md`). Six PRs, in order:
      1. [x] **Sections per list** (migration `0008`, `views/sections.ts`; the owner unlocked "Inside a list"): every list stores its sections,
         the Mass's by default; "⋯" → "Secciones del listado" switches each on and off (a section with songs, or the last one on, stays on);
         "Otras partes" became "Otras secciones" and the labels say "sección". The migration removes the lists that exist (the owner chose to
         start them again) and the devices drop theirs when they open the new version (IndexedDB 3): nothing to run by hand. "Agregar a un
         listado" (second step), the picker, singing and print follow the list's sections. **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 38.
      2. [x] **Own sections** (`views/sections.ts`, `Setlists.addPart` / `renamePart` / `movePart` / `removePart`; no migration, no locked row): on the
         sections screen each row has its switch, its name (touch it to rename it; the songs stay, they hold the id), the arrows and "✕"; at the end a field
         to add a section of the person's own (an id made on the device, `p-…`) and, as chips, the Mass's sections the list does not have ("O una de la Misa").
         A section with songs cannot be deleted or switched off; the last one cannot either; at most 30. The switch stays in the row (the approved mockup of
         this PR drew a rosary with none). **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 39.
      3. [x] **Templates** (a third synced collection: `templates` table, migrations `0009` and `0010` for MySQL; `data/templates.ts`, `views/templates.ts`,
         `views/template.ts`; the owner unlocked "＋ Nuevo" of the lists screen and `DESIGN-LOCK.md` says so): the Misa is a template like any other (made by the
         app after a sync, fixed id, editable and deletable); "＋ Nuevo" opens "Selecciona una plantilla" (the last one used first, kept on the device; "En blanco";
         "Administrar plantillas" last); a list starts with a copy of the sections and a title from the template ("Rosario del 1 de noviembre"); templates are saved
         from a list ("Guardar como plantilla" on the sections screen) and managed on `/plantillas` (open, rename, sections with the same editor as a list's, duplicate,
         delete after a question). Up to 20. The sheet is shown **always**, even with one template (so "Administrar plantillas" is always reachable); the plan said
         "with one template it creates at once": say if the owner prefers that. **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 40.
      4. [x] **Tags and the filter of the picker** (`songs.tags`, migration `0011`; `data/tags.ts`, `views/tag-field.ts`, `views/add.ts`; no locked row): a song has up to 8 free
         tags of up to 30 characters (compared without accents or capitals), edited **below the lyrics, optional** (`Etiquetas`: chips that go away when touched, Enter or a comma adds one,
         and the ones in use plus the Mass's offered to touch); a section asks for a tag (`tagOf`: the Mass's short one by its id, "Entrada" for "Canto de entrada", else its name);
         the picker of a section shows the songs with it first, with "Mostrar todos" always at hand, and **no filter while no song carries the tag**; picking a song without it offers "Etiquetar
         «Entrada»" in the toast; a song written from the picker starts with the section's tag; the search reads the tags like the title. Tags are not drawn in the rows (a song looks the same
         wherever it is listed). **Left for the owner to decide:** the one-time button "Etiquetar con lo que ya usas" (mockup in the plan's page; not built). **Owner's check:** `DEPLOY.md`
         "Fases 4 y 5", item 41.
      5. [x] **Tag when importing** (`views/import.ts`; no locked row, no migration): the part a header names ("ENTRADA: …") is the song's tag (the Mass's short one, "Entrada"), said in its row
         ("Etiqueta: Entrada", or "Sin etiqueta" when the importer found no part) and saved with the song; the open row has the same tag field as the song editor (below the lyrics) to change
         or take it off, with the tags in use offered. Not done on purpose: aliases for the person's own sections (a list made from the import came later: see "A list from an import"). **Owner's check:** `DEPLOY.md`
         "Fases 4 y 5", item 42.
      5b. [x] **"Etiquetarlos como «Entrada»"** (the owner approved the wording; `views/add.ts`, `untaggedUses` in `data/tags.ts`, `Library.addTag` / `removeTag`; no migration, no locked row): in the picker of a section, a card says how many
         songs the lists already use in that section and lack its tag ("6 cantos de tus listados están en Canto de entrada y no tienen la etiqueta «Entrada»") with one button; it opens a sheet that names the songs
         (five, then "Y N más") and says what is added and what is not touched; "Etiquetar N cantos" does it and the toast says so with "Deshacer", which takes off exactly the tag it put. It is per section (clearer than a global
         button) and only appears when there is something to tag (so it shows nothing until lists hold songs). **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 44.
      6. [x] **Drag to reorder** (`drag-reorder.ts`, `Setlists.reorderItem` / `reordered`; the owner unlocked "Inside a list"): holding a song (0.45 s) lifts its row, the finger moves it among the songs of its
         own section with a line showing where it lands, and letting go drops it there; auto-scrolls at the edges; a short touch still sings, a touch that moves first scrolls, the drop does not sing
         and is not a pull to sync (`pull.ts`), a sync that arrives meanwhile waits for the drop. The song's sheet keeps (now behind one "Mover" submenu, next to a new "Editar") "Subir / Bajar en esta sección" and gains **"Al inicio / Al final de esta sección"**
         (only with more than two songs in the section). A tip, "Mantén pulsado un canto para moverlo", is said once per device the first time a list has a section with two songs or more. Not done on purpose:
         dragging between sections and dragging the sections themselves. **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 43 (a real finger: Android and, at the end, the iPad).
      Not done on purpose: ready-made templates, updating lists when a template changes, lists with no sections, dragging between sections.
      **Revisit with the templates (PR 3):** "Nuevo listado" in "Agregar a un listado" creates a Mass list (it must ask which template).
- [x] Phase 7, ChordPro (the owner's mockup, done first in `musicos-catolicos` [#43](https://github.com/rudypalacios/musicos-catolicos/pull/43),
      the reference, then ported here with new golden fixtures): **a note at the end of a line of lyrics**
      (`{ci: bis}` / `{comment_italic: …}` after the words) is drawn beside the words, in italics (`line__note`; the last segment
      carries `note`), on screen and on paper; on a line of its own an annotation stays below the stanza as before (`{ci: x2}`);
      when the line ends in chords after the last word the note goes under the first of them, one space from the words;
      **a chord in parentheses** (`[(G)]`, played only on some repetitions) keeps them, shows `(Sol)` and transposes (`(La)`), the
      importer keeps the parentheses (before it dropped them: `(G)` came out as `G`), and the editor capitalises `[(g)]`. Decided with
      the owner: no special case for "bis" on its own line (it stays below like any note; write it at the end of the line). Nothing
      stored changes. **Merge order:** #43 of `musicos-catolicos` first (the fixtures were made from it). **Owner's check:** `DEPLOY.md`
      "Fases 4 y 5", item 27. Chord diagrams are not planned.

## Phase 3: print and safety nets

- [x] Print a song or a whole list, one song per page, with the `PrintLayout` cascade ported
      from musicos-catolicos (`web/src/print/`): "Imprimir" → with chords / lyrics only, key of the list,
      Letter paper like the public site. Checked against golden fixtures and Chromium's PDF printer.
- [ ] **Owner's check on the iPad** (deferred to the end: until then only the Android can be tested): "Imprimir" opens the AirPrint sheet (also from the installed app), and
      *Compartir → Guardar en Archivos* makes the PDF. If `window.print()` does nothing in the installed app,
      the fallback is to build the PDF in the app (decision pending).
- [ ] **Backup and restore: decide at the end of all the phases.** The owner's idea is a server-side job
      (cron on the host) that backs up the whole system, not only the owner's songs, and a way to restore it
      complete. Until then there is no export file from the app; printing to PDF (Compartir → Guardar en
      Archivos) covers sharing a list. Questions to settle then: what "the whole system" includes (all
      users' data, the database, the `.env`?), where the copies go, how often, and how a restore is done
      without a shell (the host has none).
- [x] Install guide (`/ayuda/instalar`, also offline) for iPad, iPhone and Android, linked from Ajustes,
      and an install bar at the bottom of every screen but singing, on every visit until the app is installed
      (`web/src/install.ts`, `web/src/views/install-banner.ts`): a button that opens Chrome's own dialog when
      Chrome offers it (it cannot be forced: the browser decides, and the dialog needs a tap), the steps for
      Safari on iOS (no dialog exists): "Cómo" opens the three steps right in the bar, so they work before
      signing in (the guide screen is behind the sign-in) and offline. "Ahora no" lasts one visit. It never says data is lost: the account
      holds everything; only unsent changes depend on the device.
- [ ] **Owner's check:** on the Android, in Chrome (not installed), the bar offers "Instalar" and the dialog opens;
      after installing, the bar is gone. On the iPad, at the end: the bar shows "Cómo" in Safari, signed out too, and it opens the steps;
      the bar is not there in the installed app.

## Later

- [ ] Songs from the Músicos Católicos catalogue (approved songs per part of the Mass).
- [ ] Personal key preference per song ("change everywhere").
- [ ] **Sharing, what comes after the list's link** (the owner's plan, 2026-11-01): (1) a song by a link, with the same lyrics switch and the same notice about the
      authors' rights; (2) accounts of other people (sign-up, password recovery, permissions, two people editing one list: today the newest edit wins as a whole), which changes the data
      model and the privacy text, so only once the first two are used. Public and private profiles stay with that third step.
- [ ] Share the key a list has each song in when the lyrics are not shared: today the visitor of a list shared with no lyrics sees the order, the titles and the authors
      but no keys (the key comes from the chords, which the server does not read: the parser lives in the app).
- [ ] `develop` branch and a preview environment, if more people use it.

## Known limits

- The newest edit wins by the clock of the device that made it; a device with a wrong clock can
  lose edits to, or win over, another. The server pulls a clock more than 5 minutes ahead back.
- `songs` has no index (SQLite and MySQL spell `CREATE INDEX IF NOT EXISTS` differently); it is
  fine for a personal library, add a MySQL-only migration if it ever is not.
- A song is limited to 60,000 bytes of lyrics (the MySQL `TEXT` column).
- A setlist is one record: if two devices edit the same list while apart, the later edit wins as a whole
  and the other is lost (a personal tool, where that is rare). Edit a list on one device at a time.
- The (no longer shown) notes of a list are limited to 2,000 characters, the note of an item to 500, a list to 80 items
  and 60,000 bytes of items.
- An upgrade of the on-device database waits while another window of an older version of the app is open
  (the splash says to close it).
