# To do

What is left. Tick an item when it is closed (`[x]`) and delete it once there is no need to
remember it.

## Where things stand

Phases 0, 1 and 2 are written. Phases 0 and 1 are merged and deployed (`lista.musicos-catolicos.com`
works); phase 2 (setlists) is on its branch, waiting for the owner's review and merge. Merged before:
the PDF import, the sign-of-peace slot, the utf8mb4 migration, and the visible start and update flow
(see the history of `main`).

Open elsewhere (owner to merge): `musicos-catolicos` [#42](https://github.com/rudypalacios/musicos-catolicos/pull/42)
and `mc.musicos-catolicos` [#43](https://github.com/rudypalacios/mc.musicos-catolicos/pull/43): PHP 8.3 only, and the
tests run only when called or by hand (the free Actions minutes ran out).

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
- [ ] Adding several songs to one part takes a round trip per song (the picker returns to the list).
      If that is slow in practice, let the picker stay open and show what has been added.
- [ ] **Paused (owner, after the UI session).** Duplicate a list ("copiar listado") to start next Sunday's from this
      Sunday's (the "Nuevo listado" sheet with "copy of the last one" was sketched with the owner; no schema change).
- [ ] **UX review (owner, later).** The UI was done first; the flows are still to be weighed. To look at again: the
      key of a list is changed only while singing (one more step than before; "Cantar desde aquí" in a song's sheet is
      the way there, and the key could go back to that sheet if it gets in the way), creating and duplicating lists,
      the order and wording of the sheets.
- [x] The setlist screen (`views/setlist.ts`), lighter: flat sections, one line per song (title, "Autor · key"),
      the whole row opens the song, a "⋯" per song (sing from here, move up/down within the part, remove with an
      "undo"), a compact header (title edited in place and growing, the day as a chip, "▶ Cantar", and a "⋯" with
      print and delete), an empty part as one line, two columns in the order of the Mass on a wide screen. The key is
      no longer changed here (it is changed while singing, which saves it to the list item); it is shown to read, in
      amber when it is not the song's own. The app's own icons are in `web/src/icons.ts` (Simple Icons is for brand
      logos only and has none of these). Adding a song is always in the head of the part (words while it is empty,
      a "+" once it has songs, and from the fourth song also one at the end: `ADD_AT_END_FROM` in `setlist.ts`).
      The head of a part is a band, each song has a blue dash, empty parts are a dashed outline, and the gap between
      parts is 1.15rem (the rows keep their 3.5rem: they are what is touched).
      Owner's check: `DEPLOY.md` "Fases 4 y 5", item 11.
- [ ] Dragging a song to reorder it was weighed and left for phase 6 (custom parts can hold a dozen songs, and the
      arrows move one place at a time); it would be a long press on the row, and it must keep the arrows
      (an alternative without dragging is required). Cheap step before it: "move to the start / the end".

## Phase 2: setlists (done, awaiting the owner's devices)

- [x] Mass template from `MASS_PARTS` (`web/src/mass.ts`): every part is a slot, five are marked
      "opcional", and the sign of peace has its explanation behind a visible ⓘ button.
- [x] One or several songs per part; key per item (semitones, −11…11) **for that list only**; a note per
      item; order within the part; at most 80 items and 60,000 bytes of items per list.
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
- [x] Notes of a list item were out of the way (a "Nota" button, one muted line). **Replaced:** the setlist screen
      (`views/setlist.ts`) no longer shows or edits notes (the list's, the items'); the data keeps them
      (`Setlist.notes`, `SetlistItem.note`, `Setlists.setNote`, all untouched), so nothing is lost. **The note of a
      song is still written while singing** (behind "⋯", with its dot). The owner will write notes in ChordPro and
      then decide how to show them on the list (see phase 7).
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
      Not done: a way to sync on a computer with no touch screen (tapping the sync line in the header would do).
- [ ] **Owner's check on the Android** for phases 4 and 5 (`DEPLOY.md`, "Fases 4 y 5", item 9 for the lists screen).
- [ ] Phase 6, templates and tags (a rosary or a prayer-meeting list must not get the 15 parts of the Mass; a
      section may hold a dozen songs, which is when dragging to reorder pays off) (schema change, migration): turn parts on and off per list, add own
      parts, a template manager (the Mass is the default); tags on songs, one per part by default; the
      picker of a part filters by its tag, with "Mostrar todos" always at hand and no filter when no
      song carries the tag; the PDF importer could tag by part.
- [ ] Phase 7, ChordPro (notes first: the owner will write the notes of a list or a song in ChordPro, and then we
      decide how to show them; the notes already stored are kept, see above): the easy tier, first in `musicos-catolicos` (the reference), then ported here
      with new golden fixtures: owner wants repeat marks like "bis" written as comments, and a chord in
      parentheses such as `[(G)]` recognised (needs the owner's confirmation of the syntax and that the
      public site changes too). Chord diagrams are not planned.

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
- The notes of a list are limited to 2,000 characters, the note of an item to 500, a list to 80 items
  and 60,000 bytes of items.
- An upgrade of the on-device database waits while another window of an older version of the app is open
  (the splash says to close it).
