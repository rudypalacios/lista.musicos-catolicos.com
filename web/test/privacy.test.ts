import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PRIVACY_EMAIL, PRIVACY_SECTIONS, PRIVACY_UPDATED } from '../src/views/privacy.ts';

const everything = JSON.stringify(PRIVACY_SECTIONS);

describe('the text about the data', () => {
    it('has a section for what the sign-up asks the person to have read, each with its own anchor', () => {
        const ids = PRIVACY_SECTIONS.map((section) => section.id);

        assert.equal(new Set(ids).size, ids.length, 'no anchor twice');
        for (const id of ['resumen', 'sin-cuenta', 'cuenta', 'compartir', 'servidor', 'terceros', 'conservacion', 'derechos']) {
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

    it('says the one thing that is loaded from another site, and only when the person asks: the player of YouTube', () => {
        assert.match(everything, /youtube-nocookie\.com/);
        assert.match(everything, /antes de ese toque no se carga nada de YouTube/);
        assert.match(everything, /viaja con lo compartido/);
        assert.match(everything, /si no lo toca, no se carga nada/);
    });

    it('says first, in the summary, that the data is used for nothing else, and that it is short', () => {
        const summary = PRIVACY_SECTIONS[0];
        assert.equal(summary?.id, 'resumen');
        assert.match(JSON.stringify(summary), /No usamos tus datos para nada más que darte tu cuenta y tus cantos/);
        assert.ok(everything.length < 9000, `the text stays short (${everything.length} characters)`);
    });

    it('says what signing in with Google keeps and asks for, and that nothing of Google is contacted before the touch', () => {
        assert.match(everything, /Continuar con Google/);
        assert.match(everything, /el identificador de tu cuenta de Google: nada más de tu perfil/);
        assert.match(everything, /tu contraseña de Google nunca pasa por Listas/);
        assert.match(everything, /antes de ese toque no se contacta a Google/);
        assert.match(everything, /hasta 10 minutos/);
        assert.match(everything, /hay dos más/, 'Google and YouTube are the only two');
    });

    it('does not promise what the app does not do: no analytics of its own, and deleting an account is in Ajustes, after 3 days', () => {
        assert.match(everything, /no hay publicidad ni analítica/);
        assert.match(everything, /Puedes eliminar tu cuenta tú mismo, en Ajustes/);
        assert.match(everything, /la guardamos 3 días por si cambias de opinión/);
        assert.ok(everything.includes(PRIVACY_EMAIL), 'and the address stays for what cannot be done in the app');
    });
});
