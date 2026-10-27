# To do

What is left. Tick an item when it is closed (`[x]`) and delete it once there is no need to
remember it.

## Where things stand

Phases 0 and 1 are merged and deployed (`lista.musicos-catolicos.com` works). Merged since: the PDF
import, the sign-of-peace slot, the utf8mb4 migration, and the visible start and update flow (see
the history of `main`). Phase 2 is designed below and **not started in code**.

Open elsewhere (owner to merge): `musicos-catolicos` [#42](https://github.com/rudypalacios/musicos-catolicos/pull/42)
and `mc.musicos-catolicos` [#43](https://github.com/rudypalacios/mc.musicos-catolicos/pull/43): PHP 8.3 only, and the
tests run only when called or by hand (the free Actions minutes ran out).

## Owner's checks (cannot be done from the sandbox: Safari, real devices, the host)

- [ ] On the iPad and the Android, installed (`DEPLOY.md`, "Pruebas en los dispositivos" and "Cantos
      (fase 1)"): write a song offline, reload, sync; fit-to-screen on the iPad and the phone; import
      the real PDF and see how it lands; the "Descargando… / Hay una versión nueva / Actualizando…"
      flow after a deploy; the 8-day test that a home-screen app keeps its songs.
- [ ] After the deploy, check the tables are `utf8mb4` (migration `0003`; `DEPLOY.md`, "Comprobar el
      primer deploy", step 3).
- [ ] After a squash merge, delete the work branch: its early commits hold fragments of real lyrics
      (the squash commit of #3 on `main` still does; rewriting `main` is the owner's call).

## Small things to do when convenient

- [ ] Tune the fit limits (`DEFAULT_LIMITS` in `web/src/fit.ts`) after seeing it on the devices.
- [ ] Keep the screen awake while a song is open (Screen Wake Lock; iPad Safari 16.4+).

## Phase 2: setlists (designed, next)

The owner's idea: "create a list" opens a template with every part of the Mass; each part takes songs
from the library; the key of a song can be raised **for that list only** and the original stays as it is.

**Decisions already taken**

- The template is `MASS_PARTS` (`web/src/mass.ts`), in Missal order, every slot shown; optional ones
  (salmo, memorial, amén, paz, acción de gracias) are marked "opcional" and nothing is enforced. The
  sign of peace gets a slot with the note "No es parte de la misa: el Misal no prescribe un canto para el
  saludo de la paz, aunque en algunas parroquias se incluye." Shown through a visible ⓘ button (touch
  screens have no hover), plus `title`.
- A slot takes one or several songs. Part names are the Roman Missal's, not local ones.
- The key change is **per list item only** (semitones, −11…11). "Change it everywhere" is a later,
  separate feature (personal key preference per song, see Later).
- Transposing while performing a list **saves to the item** (it is the same "for this list" change).

**Data model.** One record per list: table `setlists` (`id`, `user_id`, `title`, `event_date` nullable
`YYYY-MM-DD`, `notes`, `items` TEXT holding JSON, `updated_at` BIGINT ms, `deleted_at` BIGINT null,
`seq`). An item is `{id (uuid), part (MassPart id), songId, transpose, note ≤ 500}`; at most 80 items,
the JSON at most 60,000 bytes. The whole list is the unit of last-write-wins (a personal tool: two
devices editing one list at once is rare; document it). Same per-user `seq` counter as songs: extract
`Sequence` from `SongRepository`, one cursor for everything. New tables need a `.mysql.sql` follow-up
making them `utf8mb4` (`CLAUDE.md`, "Database"). A song deleted elsewhere leaves an item pointing at
nothing: show "Canto eliminado" and let it be removed.

**API.** `GET /api/sync` and `POST /api/sync` carry `{songs, setlists}`. Pull: query each table with
`LIMIT page+1`, merge by `seq`, cut at the page, cursor = the last `seq`. Push validates like
`SongChange` (new `SetlistChange`, Spanish messages, all-or-nothing 400).

**Client.** Generalize `LocalStore` to collections (`songs`, `setlists`; IndexedDB version 2 adds
`setlists` and `pending-setlists`, the existing stores stay), `Remote.push/pull` and `SyncEngine` carry
both, `shouldTakeRemote` is already generic. A `Setlists` library next to `Library` (create, update
title/date/notes, add/remove/move/transpose/annotate item). Deleting a song that is in lists asks first.

**Screens** (real URLs, served offline like the rest): `/listados` (lists, newest first; "Nuevo
listado" creates one with today's date and opens it); `/listados/:id` (the template by slot: title, date,
notes; per item −/+/key, a note, up/down within the slot, remove; "Agregar canto" per slot);
`/listados/:id/agregar/:part` (song picker with the existing search); `/listados/:id/cantar/:n` (performing:
previous/next, swipe, arrow keys, "3/10", the part and the item's note, fit-to-screen as in the song
viewer, transposing saves to the item). Header tabs "Cantos | Listados". Refactor `views/view.ts` so
the reader (sheet, toolbar, fit) is reusable by both the song page and the performing view.

**Tests expected** (same bar as phase 1): PHP (Sequence, SetlistChange validation, repository
last-write-wins, both collections through the API, on SQLite and on MariaDB including a database created
as plain `utf8`); TypeScript (store contract for both collections on the Map store and a fake IndexedDB,
sync engine with lists, library, grouping items by part, router); Chromium e2e (create a list, fill
slots, per-item transposition, performing it offline, two devices, deleting a song that is in a list).

## Phase 3: print and safety nets

- [ ] Print a song or a whole list, one song per page, with the `PrintLayout` cascade ported
      from musicos-catolicos.
- [ ] Export the list as a file (backup), and print to PDF for Drive.
- [ ] Install guidance for iPad (home-screen install keeps the data; a Safari tab can lose it).

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
