# To do

What is left. Tick an item when it is closed (`[x]`) and delete it once there is no need to
remember it.

## Where things stand

Phases 0 to 5 are written and merged (songs, setlists, print, the quiet usage fixes and Ajustes), and the
interface is settled: the bar and sync dot, the menu, the lists screen, the inside of a list and singing are
**locked** (`DESIGN-LOCK.md`: not to be changed unless the owner asks in that session). Phases 6 (templates and
tags) and 7 (ChordPro) are not started. What comes next is a review of the flows of use, in its own session.

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
- The upgrade of the on-device database from version 1 (`data/idb-store.ts`, cursor reset): a device that has not
  been opened since the lists existed would otherwise never pull the lists the server already holds.

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
- [x] A starred list shows a small yellow star (drawn, `--star`) after its details on the lists screen ("10 cantos · mar 1 sep ★"),
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
      the limit), and **a day can be removed** from a list: a "✕" of 44px (`Quitar la fecha`) beside the day chip, only while there is
      a day (a date field cannot always be emptied by hand, e.g. on an iPad). The day was already optional in the model;
      "＋ Nuevo" still starts for today. **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 24.
- [x] **"Eliminar listado" moved to the lists screen**: it is the last action (red, set apart) of the row's "⋮" sheet, and it
      asks first with a dialog drawn by the app (`views/confirm-dialog.ts`: "Cancelar" is the focused answer, Escape, a touch
      outside and the back button also cancel) instead of the browser's `confirm()`, which looks different on each device. A
      toast says "Listado eliminado". It is gone from inside a list, whose "⋮" now only prints (so it is hidden while the list has
      no songs). **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 23. Still on the browser's `confirm()`: deleting a song
      (`views/edit.ts`) and signing out with unsent changes (`signOut`): move them to `confirmDialog` when the owner wants.
- [x] **New song, PR A of the review** (`views/edit.ts`, `views/import.ts`): a missing title is said at the title field (marked,
      focused, message under it) and no longer at the foot of the form; a song saved with no lyrics says so in a toast (allowed: a
      title first, the lyrics later); a **repeated title is neither warned nor blocked** (the owner: several "Santo" and "Gloria"
      exist); Importar draws its own "Elegir PDF" button instead of the browser's, with a shorter explanation; the import cards
      capitalise a lowercase chord (preview and save) like the editor. **Owner's check:** `DEPLOY.md` "Fases 4 y 5", item 25.
- [ ] A help page (FAQ) in the app: `faq.md` holds the first notes (the draft of "Nuevo canto"); make it a screen later, in Spanish, reachable from Ajustes.
- [x] **New song, PR B** (`views/edit.ts`, `song-draft.ts`, `importer.ts` `convertPastedSheet`; the owner approved the mockup): "Escribir | Ver"
      above the lyrics on a phone (side by side from 900px), Guardar / Cancelar fixed at the foot, a sheet pasted with chords over the words is
      converted once with "N acordes convertidos" and "Deshacer", and a draft of the new song is kept on the device (`localStorage`, one per
      device, cleared by Guardar, Cancelar, Descartar and sign-out; not used when the song starts from a part's picker). **Owner's check:**
      `DEPLOY.md` "Fases 4 y 5", item 26. Not done on purpose: converting Latin chord names to English on save (the owner has not decided; the
      parser already reads both), "Agregar a un listado" after saving from Cantos.
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
- [ ] Dragging a song to reorder it was weighed and left for phase 6 (custom parts can hold a dozen songs, and the
      arrows move one place at a time); it would be a long press on the row, and it must keep the arrows
      (an alternative without dragging is required). Cheap step before it: "move to the start / the end".

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
- [ ] **Owner's check on the Android** for phases 4 and 5 (`DEPLOY.md`, "Fases 4 y 5", item 9 for the lists screen).
- [ ] Phase 6, templates and tags (a rosary or a prayer-meeting list must not get the 15 parts of the Mass; a
      section may hold a dozen songs, which is when dragging to reorder pays off) (schema change, migration): turn parts on and off per list, add own
      parts, a template manager (the Mass is the default); tags on songs, one per part by default; the
      picker of a part filters by its tag, with "Mostrar todos" always at hand and no filter when no
      song carries the tag; the PDF importer could tag by part.
- [x] Phase 7, ChordPro (the owner's mockup, done first in `musicos-catolicos` [#43](https://github.com/rudypalacios/musicos-catolicos/pull/43),
      the reference, then ported here with new golden fixtures): **a note at the end of a line of lyrics**
      (`{ci: bis}` / `{comment_italic: …}` after the words) is drawn beside the words, in italics (`line__note`; the last segment
      carries `note`), on screen and on paper; on a line of its own an annotation stays below the stanza as before (`{ci: x2}`);
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
- [ ] Share a list by link; public and private profiles. Needs the privacy text (`CLAUDE.md`,
      "Policies") and a look at copyright.
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
