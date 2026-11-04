import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PRIVACY_EMAIL, PRIVACY_SECTIONS, PRIVACY_UPDATED } from '../src/views/privacy.ts';

const everything = JSON.stringify(PRIVACY_SECTIONS);

describe('the text about the data', () => {
    it('has a section for what the sign-up asks the person to have read, each with its own anchor', () => {
        const ids = PRIVACY_SECTIONS.map((section) => section.id);

        assert.equal(new Set(ids).size, ids.length, 'no anchor twice');
        for (const id of ['sin-cuenta', 'cuenta', 'compartir', 'servidor', 'dispositivo', 'terceros', 'conservacion', 'derechos']) {
            assert.ok(ids.includes(id), id);
        }
        for (const section of PRIVACY_SECTIONS) {
            assert.ok(section.title !== '' && section.blocks.length > 0, section.id);
        }
    });

    it('says the numbers the server keeps (a session 180 days, the links 2 days and 1 hour, the counters 15 minutes and a day)', () => {
        for (const said of ['180 días', '2 días', '1 hora', '15 minutos', 'un día']) {
            assert.ok(everything.includes(said), said);
        }
    });

    it('says where to write and when it was revised', () => {
        assert.match(PRIVACY_EMAIL, /^[^@\s]+@[^@\s]+\.[^@\s]+$/);
        assert.match(PRIVACY_UPDATED, /^\d{1,2} de [a-z]+ de \d{4}$/);
        assert.ok(everything.includes(PRIVACY_EMAIL));
    });

    it('does not promise what the app does not do: no analytics of its own, and deleting an account is by email for now', () => {
        assert.match(everything, /no usa analítica ni publicidad/);
        assert.match(everything, /Por ahora, para borrar tu cuenta escribe a/);
    });
});
