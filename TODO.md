# To do

What is left. Tick an item when it is closed (`[x]`) and delete it once there is no need to
remember it.

## Phase 0: skeleton and pipeline (this branch)

- [x] Build, API with login, migrations, offline shell, deploy workflow, tests.
- [ ] **Owner, in cPanel:** subdomain, HTTPS, PHP 8.3, MySQL, FTP account, `.env`, root
      `.htaccess` (`DEPLOY.md`).
- [ ] **Owner, in GitHub:** `production` environment with the FTP secrets.
- [ ] First deploy, then the checks on the real devices (`DEPLOY.md`, "Pruebas en los
      dispositivos"): Android Chrome and iPad Safari, installed, in airplane mode.

## Phase 1: songs and viewer (this branch)

- [x] ChordPro parser, chords, notation, transposition and lyrics renderer ported from
      musicos-catolicos, checked against golden fixtures made by the PHP and `song.js`.
- [x] Own songs: create, edit and delete, in ChordPro (private), kept on the device and synced.
- [x] Importer: pasted "chords above the lyrics" text to ChordPro, with a review step.
- [x] Viewer with transposition, Do/C notation, lyrics size and fit-to-screen (toggle per device;
      maximum 34px, minimum 13px, two columns on wide screens, then scroll).
- [ ] **Owner, on the real devices** (`DEPLOY.md`, "Pruebas en los dispositivos"): write a song
      offline on the iPad, reload, sync; read it fitted on the iPad and the phone; import a
      real sheet from the September–October PDF and see how far off the chords land.
- [ ] **Owner:** after the deploy, check the tables are `utf8mb4` (migration `0003`; `DEPLOY.md`, "Comprobar el primer deploy", step 3).
- [ ] Tune the fit limits (`DEFAULT_LIMITS` in `web/src/fit.ts`) after seeing it on the devices.
- [ ] Keep the screen awake while a song is open (Screen Wake Lock; iPad Safari 16.4+).

## Phase 2: setlists

- [ ] Mass template with the standard parts of the Roman Missal (required and optional): the
      list is in `web/src/mass.ts`. Decide whether the sign of peace gets a slot (the Missal
      prescribes no chant for it).
- [ ] A song per part, key per list item (semitones), notes per item, order.
- [ ] Setlists in the same store and sync engine as the songs (the queue and the cursor are generic).

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
