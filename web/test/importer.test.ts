import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chordOf, importChordsOverLyrics, isChordLine } from '../src/importer.ts';
import { isVerseLabel, parse } from '../src/chordpro/parser.ts';
import { MASS_PARTS, plain } from '../src/mass.ts';

describe('chordOf', () => {
    const chords: [string, string][] = [
        ['C', 'C'], ['Am', 'Am'], ['F#m7', 'F#m7'], ['Bb', 'Bb'], ['G/B', 'G/B'], ['Asus4', 'Asus4'], ['Cmaj7', 'Cmaj7'],
        ['A-', 'Am'], ['D-', 'Dm'], ['D-7', 'Dm7'], ['A-/G', 'Am/G'],
        ['(G)', 'G'], ['(E', 'E'], ['Am)', 'Am'],
        ['SOL', 'G'], ['RE', 'D'], ['RE7', 'D7'], ['MIm', 'Em'], ['SIm', 'Bm'], ['FA#', 'F#'], ['SOLm', 'Gm'],
        ['Rem', 'Dm'], ['Solm', 'Gm'], ['La7', 'A7'], ['Sib', 'Bb'], ['Do', 'C'], ['Fa', 'F'], ['Lam', 'Am'],
    ];
    for (const [token, expected] of chords) {
        it(`reads ${token} as ${expected}`, () => {
            assert.equal(chordOf(token), expected);
        });
    }

    const words = [
        'Vienen', 'Señor,', 'Amén', 'Aleluya', 'la', 'de', 'y', 'mi', 'sol', 'x2', '(BIS)', '(2)', 'Add', 'Dim', 'Bed',
        'Dios', 'Santo,', 'Misa', 'Solo', '', '1.', '-', 'Gloria',
    ];
    for (const word of words) {
        it(`reads ${JSON.stringify(word)} as a word`, () => {
            assert.equal(chordOf(word), null);
        });
    }
});

describe('isChordLine', () => {
    it('is true when every token is a chord', () => {
        assert.equal(isChordLine('C     Em F       G'), true);
        assert.equal(isChordLine('Dm    E   Am   (E Am)'), true);
        assert.equal(isChordLine('  RE SOL RE '), true);
    });

    it('is false for lyrics, even when they start with a note name or end in a chord letter', () => {
        for (const line of ['Si me falta el amor', 'La la la', 'Sol y luna', 'A Dios', 'Vienen con alegría Señor,', 'Am  Dm  lalala']) {
            assert.equal(isChordLine(line), false, line);
        }
    });
});

describe('importChordsOverLyrics: where the chords go', () => {
    it('puts each chord at the column it was over', () => {
        const imported = importChordsOverLyrics('C        G\nCuánto he esperado\n');

        assert.equal(imported.body, '[C]Cuánto he [G]esperado');
    });

    it('lets a chord fall inside a word, where the syllable is', () => {
        const imported = importChordsOverLyrics('   D\nesperado');

        assert.equal(imported.body, 'esp[D]erado');
    });

    it('moves a chord over a gap to the next word', () => {
        const imported = importChordsOverLyrics('     G\nuno  dos tres');

        assert.equal(imported.body, 'uno  [G]dos tres');
    });

    it('keeps the order of chords that land past the end, with a space between', () => {
        const imported = importChordsOverLyrics('C             Em   Am\nAsí vamos');

        assert.equal(imported.body, '[C]Así vamos[Em] [Am]');
    });

    it('does not let a chord past the end land inside another one', () => {
        const imported = importChordsOverLyrics('Dm    E   Am   (E Am)\nallí está');

        assert.ok(!/\[[^\]]*\[/.test(imported.body), imported.body);
        assert.equal(imported.body, '[Dm]allí e[E]stá[Am] [E] [Am]');
    });

    it('treats chords with no lyric under them as an intro line, and says so', () => {
        const imported = importChordsOverLyrics('G D Em C\n\nC\nLetra');

        assert.equal(imported.body, '[G] [D] [Em] [C]\n\n[C]Letra');
        assert.ok(imported.warnings.some((w) => w.includes('sin letra')));
    });

    it('expands tabs so the columns still line up', () => {
        const imported = importChordsOverLyrics('C\tG\nuno\tdos');

        assert.equal(imported.body, '[C]uno [G]dos');
    });

    it('treats non-breaking spaces as spaces', () => {
        const imported = importChordsOverLyrics('C   G\nuno dos');

        assert.equal(imported.body, '[C]uno [G]dos');
    });

    it('reads Windows and old Mac line breaks', () => {
        assert.equal(importChordsOverLyrics('C\r\nuno\r\n\r\nG\r\ndos').body, '[C]uno\n\n[G]dos');
        assert.equal(importChordsOverLyrics('C\runo').body, '[C]uno');
    });
});

describe('importChordsOverLyrics: structure', () => {
    it('turns verse numbers into labels and keeps the chords aligned to the text', () => {
        const imported = importChordsOverLyrics('C          Am\n1.  Vienen trayendo\n');

        assert.equal(imported.body, '{c: Verso 1}\n[C]Vienen [Am]trayendo');
    });

    it('starts a new verse at each number even without a blank line', () => {
        const imported = importChordsOverLyrics('1. Uno\n2. Dos\n3) Tres');

        assert.equal(imported.body, '{c: Verso 1}\nUno\n\n{c: Verso 2}\nDos\n\n{c: Verso 3}\nTres');
    });

    it('turns a CORO line into a label and drops the blank line after it', () => {
        const imported = importChordsOverLyrics('Uno\n\nCORO\n\nDos');

        assert.equal(imported.body, 'Uno\n\n{c: Coro}\nDos');
        assert.deepEqual(parse(imported.body).sections.map((s) => [s.label, s.kind]), [[null, 'verse'], ['Coro', 'chorus']]);
    });

    it('recognises the other section names, and does not read a label as the words under chords', () => {
        const imported = importChordsOverLyrics('INTRO\nG D\nPuente\nuno\nFINAL\ndos');

        assert.deepEqual(
            parse(imported.body).sections.map((s) => [s.label, s.kind]),
            [['Intro', 'other'], ['Puente', 'other'], ['Final', 'other']],
        );
    });

    it('leaves "(BIS)" and "(2)" in the lyrics', () => {
        assert.equal(importChordsOverLyrics('C\nVienen con alegría. (BIS)').body, '[C]Vienen con alegría. (BIS)');
    });

    it('collapses blank lines and trims the ends', () => {
        assert.equal(importChordsOverLyrics('\n\nuno\n\n\n\ndos\n\n\n').body, 'uno\n\ndos');
    });

    it('is empty for empty input', () => {
        const imported = importChordsOverLyrics('  \n\n');

        assert.equal(imported.body, '');
        assert.equal(imported.title, '');
    });
});

describe('importChordsOverLyrics: the header', () => {
    it('takes the song after "PART:"', () => {
        const imported = importChordsOverLyrics('ENTRADA: Vienen con alegría\n\nC\nVienen');

        assert.equal(imported.title, 'Vienen con alegría');
        assert.equal(imported.part, 'entrada');
        assert.equal(imported.body, '[C]Vienen');
    });

    it('knows the sheet names of the parts, not only the standard ones', () => {
        const cases: [string, string][] = [
            ['OFRENDAS: En torno al pan', 'ofertorio'], ['Comunión: Donde hay caridad', 'comunion'],
            ['SALIDA: Dijiste Sí', 'salida'], ['Piedad Kyrie:', 'senor-ten-piedad'], ['GLORIA', 'gloria'],
            ['Santo Alegre', 'santo'], ['CORDERO DE DIOS   Misa Rítmica Mejía.', 'cordero'],
            ['ALELUYA Junto a ti Jesús', 'aclamacion'], ['Ofertorio: Pan de vida', 'ofertorio'],
        ];
        for (const [header, part] of cases) {
            assert.equal(importChordsOverLyrics(`${header}\n\nC\nLetra`).part, part, header);
        }
    });

    it('names a fixed text after the liturgy and keeps the setting as the author', () => {
        const imported = importChordsOverLyrics('PADRE NUESTRO: Martín Valverde (C2)\n\nRE SOL\nPadre nuestro');

        assert.equal(imported.title, 'Padre nuestro');
        assert.equal(imported.author, 'Martín Valverde');
        assert.match(imported.body, /^\{capo: 2\}\n/);
        assert.ok(imported.warnings.some((w) => w.includes('cejilla')));
    });

    it('keeps the whole line as the title when there is no colon', () => {
        assert.equal(importChordsOverLyrics('Santo Alegre\nE   A\nSanto').title, 'Santo Alegre');
        assert.equal(importChordsOverLyrics('CORDERO DE DIOS   Misa Rítmica Mejía.\n\nRem\nCordero').title, 'CORDERO DE DIOS Misa Rítmica Mejía');
    });

    it('capitalises a title written in capitals', () => {
        assert.equal(importChordsOverLyrics('GLORIA\n\nDm\nGloria').title, 'Gloria');
    });

    it('does not take a lyric for a header', () => {
        const imported = importChordsOverLyrics('C\nVienen con alegría\n\nG\nSeñor');

        assert.equal(imported.title, '');
        assert.equal(imported.body, '[C]Vienen con alegría\n\n[G]Señor');
    });

    it('takes a lone first line as the title when chords follow after a blank line', () => {
        const imported = importChordsOverLyrics('Dijiste Sí\n\nC\nUno');

        assert.equal(imported.title, 'Dijiste Sí');
        assert.equal(imported.body, '[C]Uno');
    });
});

describe('importChordsOverLyrics: chord names and warnings', () => {
    it('writes minor, Latin and parenthesised chords in the standard form, and counts them', () => {
        const imported = importChordsOverLyrics('A-   SOL   (Re)   C\nuno dos tres cuatro');

        assert.match(imported.body, /\[Am\].*\[G\].*\[D\].*\[C\]/);
        assert.ok(imported.warnings.some((w) => w.startsWith('3 acordes')), imported.warnings.join('|'));
    });

    it('says when there are no chords at all', () => {
        assert.ok(importChordsOverLyrics('solo letra\notra línea').warnings.some((w) => w.includes('No encontré acordes')));
    });

    it('stays quiet when everything was already standard', () => {
        assert.deepEqual(importChordsOverLyrics('C   G\nuno dos').warnings, []);
    });
});

/** The owner's own sheets (September–October), as they paste from the PDF */
describe('importChordsOverLyrics: songs from the owner\'s PDF', () => {
    const wordsOf = (text: string): string[] => text.replace(/\[[^\]]*\]/g, '').split(/\s+/).filter((w) => w !== '');

    const songs: Record<string, { input: string; title: string; part: string; labels: string[] }> = {
        vienen: {
            title: 'Vienen con alegría', part: 'entrada', labels: ['Verso 1', 'Verso 2'],
            input: 'ENTRADA: Vienen con alegría\n\nC\nVienen con alegría Señor,\n'
                + '                                C7\ncantando vienen con alegría Señor.\n'
                + 'F               G                  Em     Am\nLos que caminan  por la vida Señor,\n'
                + '        Dm          G          C\nsembrando tu paz y amor. (BIS)\n\n'
                + 'C                          Am    Dm\n1.  Vienen trayendo la esperanza,\n'
                + '          G          Dm                 C\na un mundo cargado de ansiedad.\n\n'
                + 'C                          Am    Dm\n2.  Vienen trayendo entre sus manos\n'
                + '          G          Dm                 C\nesfuerzos de hermanos por la paz,\n',
        },
        kyrie: {
            title: 'Piedad Kyrie', part: 'senor-ten-piedad', labels: [],
            input: 'Piedad Kyrie:\n\nA-        D-             G\nSeeeeeñor ten piedad,\nC                A-\nSeñor ten piedad,\n'
                + 'D-               E                 A-\nSeñor ten piedad, ten piedad\n\n'
                + 'A-                 D-                              G\nCristo ten piedad, ten piedad, ten piedad\n\nSeeeeeeñor…..\n',
        },
        padreNuestro: {
            title: 'Padre nuestro', part: 'padre-nuestro', labels: [],
            input: 'PADRE NUESTRO: Martín Valverde (C2)\n\nRE SOL RE\nPadre nuestro que estás en el cielo\n'
                + 'SOL MIm LA\nSantificado sea tu nombre\nSOL FA# SIm\nVenga a nosotros tu reino\n'
                + 'RE RE7 SOL SOLm\nNo nos dejes caer en la tentación\nSOLm RE\ndel mal\n',
        },
        cordero: {
            title: 'CORDERO DE DIOS Misa Rítmica Mejía', part: 'cordero', labels: ['Verso 1'],
            input: 'CORDERO DE DIOS   Misa Rítmica Mejía.\n\nRem          Sib\n1.  Cordero de Dios,\n'
                + '    Solm                    La7\nque quitas el pecado del mundo.\nRem    Do        Rem\nTen piedad de nosotros\n'
                + '        Do          Rem\nTen piedad de nosotros. (2)\n',
        },
        ofrendas: {
            title: 'En torno al pan', part: 'ofertorio', labels: ['Coro'],
            input: 'OFRENDAS: En torno al pan\n\n  Em                    C                    G\nLas fuerzas se rehacen en la mesa,\n\n'
                + 'CORO\n\n  Em         C          G\nLAS FUERZAS SE REHACEN EN LA MESA,\n',
        },
    };

    for (const [name, song] of Object.entries(songs)) {
        it(`${name}: header, labels and chords`, () => {
            const imported = importChordsOverLyrics(song.input);

            assert.equal(imported.title, song.title);
            assert.equal(imported.part, song.part);
            const sheet = parse(imported.body);
            assert.ok(sheet.hasChords);
            assert.deepEqual(sheet.sections.filter((s) => s.label !== null).map((s) => s.label), song.labels);
        });

        it(`${name}: every word of the lyrics survives`, () => {
            const imported = importChordsOverLyrics(song.input);
            const lyricLines = song.input
                .split('\n')
                .slice(1)
                .filter((line) => line.trim() !== '' && !isChordLine(line))
                .map((line) => line.replace(/^\s*\d+\.\s+/, '').replace(/^CORO$/, ''));
            const original = wordsOf(lyricLines.join(' '));
            const body = imported.body
                .split('\n')
                .filter((line) => !line.startsWith('{'))
                .join(' ');

            // Chords may split a word ("espe[Am]ranza"), so compare the letters, not the words
            assert.equal(wordsOf(body).join('').replace(/\[[^\]]*\]/g, ''), original.join(''));
        });
    }

    it('Vienen con alegría: the chords are where the syllables are', () => {
        const body = importChordsOverLyrics(songs['vienen']?.input ?? '').body;

        assert.match(body, /^\[C\]Vienen con alegría Señor,\n/);
        assert.match(body, /\{c: Verso 1\}\n\[C\]Vienen trayendo la espe\[Am\]ranza,/);
    });

    it('Padre nuestro: chords-only lines of capitals become chords before each line', () => {
        const body = importChordsOverLyrics(songs['padreNuestro']?.input ?? '').body;

        assert.match(body, /\[D\]Pad.*\n.*\[Em\]/);
        assert.ok(!body.includes('SOL') && !body.includes('MIm'));
    });

    it('the labels it writes are the ones the public site reads as verses and choruses', () => {
        const sheet = parse(importChordsOverLyrics(songs['ofrendas']?.input ?? '').body);

        assert.equal(sheet.sections.find((s) => s.label === 'Coro')?.kind, 'chorus');
        assert.ok(isVerseLabel('Verso 1'));
    });
});

describe('mass parts', () => {
    it('lists the sung parts once, in the order of the Missal', () => {
        assert.deepEqual(
            MASS_PARTS.map((part) => part.id),
            ['entrada', 'senor-ten-piedad', 'gloria', 'salmo', 'aclamacion', 'ofertorio', 'santo', 'memorial', 'amen',
                'padre-nuestro', 'cordero', 'comunion', 'accion-de-gracias', 'salida'],
        );
    });

    it('has no alias claimed by two parts', () => {
        const seen = new Map<string, string>();
        for (const part of MASS_PARTS) {
            for (const alias of part.aliases) {
                assert.equal(plain(alias), alias, `${alias} must be written plain`);
                assert.ok(!seen.has(alias), `${alias} is in ${seen.get(alias)} and ${part.id}`);
                seen.set(alias, part.id);
            }
        }
    });

    it('compares names without accents or case', () => {
        assert.equal(plain('Aclamación  ANTES del Evangelio!'), 'aclamacion antes del evangelio');
    });
});
