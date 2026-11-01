import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { App } from '../src/app.ts';
import { writeKeyToSong } from '../src/transpose-song.ts';

/** What a list sings the song at: its written key moved by the list's shift, as a number of semitones from C */
const sounding = (written: number, shift: number): number => (((written + shift) % 12) + 12) % 12;

describe('writeKeyToSong', () => {
    it('writes the key on screen into the song and keeps every saved key sounding as it did', async () => {
        const app = await App.create();
        const song = await app.create({ title: 'Abrimos la puerta', author: '', body: '{key: F}\n[F]Abrimos [C]la [Dm]puerta' });
        const first = await app.setlists.create();
        const second = await app.setlists.create();
        await app.setlists.addItem(first.id, 'entrada', song.id);
        await app.setlists.addItem(second.id, 'salida', song.id);
        const itemIn = async (id: string) => (await app.setlists.get(id))?.items[0];
        await app.setlists.setTranspose(first.id, (await itemIn(first.id))?.id ?? '', 0);
        await app.setlists.setTranspose(second.id, (await itemIn(second.id))?.id ?? '', 2);
        await app.setMyShift(song.id, 3);

        // Written in F (5); it is lowered a semitone on screen and that becomes the written key (E, 4)
        const written = await writeKeyToSong(app, song, -1);

        assert.equal(written.body, '{key: E}\n[E]Abrimos [B]la [C#m]puerta');
        // the other saved keys moved up one, so F sounds F (5) in the first list, G (7) in the second, Ab (8) for the person
        assert.equal(sounding(4, (await itemIn(first.id))?.transpose ?? 99), 5);
        assert.equal(sounding(4, (await itemIn(second.id))?.transpose ?? 99), 7);
        assert.equal(sounding(4, (await app.list())[0]?.myShift ?? 99), 8);
    });

    it('does nothing for a move of 0', async () => {
        const app = await App.create();
        const song = await app.create({ title: 'Igual', author: '', body: '[G]Letra' });

        assert.equal(await writeKeyToSong(app, song, 0), song);
    });
});
