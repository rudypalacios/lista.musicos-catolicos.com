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

- [ ] Tune the fit limits (`DEFAULT_LIMITS` in `web/src/fit.ts`) after seeing it on the devices.
- [ ] Keep the screen awake while a song is open or a list is being sung (Screen Wake Lock; iPad Safari 16.4+).
- [ ] Adding several songs to one part takes a round trip per song (the picker returns to the list).
      If that is slow in practice, let the picker stay open and show what has been added.
- [ ] Duplicate a list ("copiar listado") to start next Sunday's from this Sunday's.

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
- [x] Install guide (`/ayuda/instalar`, also offline) for iPad, iPhone and Android, linked from the song list,
      and a calm, closable note shown only to Safari on iOS (`web/src/install.ts`). It never says data is lost:
      the account holds everything; only unsent changes depend on the device.
- [ ] **Owner's check on the iPad, at the end:** the note appears in Safari, not in the installed app; "Ver cómo"
      opens the guide.

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
