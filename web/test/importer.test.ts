import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chordOf, importChordsOverLyrics, importMany, isChordLine } from '../src/importer.ts';
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
        'Caminamos', 'Señor,', 'Amén', 'Aleluya', 'la', 'de', 'y', 'mi', 'sol', 'x2', '(BIS)', '(2)', 'Add', 'Dim', 'Bed',
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
        for (const line of ['Si me falta el amor', 'La la la', 'Sol y luna', 'A Dios', 'Caminamos con alegría, Señor,', 'Am  Dm  lalala']) {
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
        const imported = importChordsOverLyrics('C          Am\n1.  Un pueblo que espera\n');

        assert.equal(imported.body, '{c: Verso 1}\n[C]Un pueb[Am]lo que espera');
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
        assert.equal(importChordsOverLyrics('C\nCaminamos con alegría. (BIS)').body, '[C]Caminamos con alegría. (BIS)');
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
        const imported = importChordsOverLyrics('ENTRADA: Caminamos con alegría\n\nC\nCaminamos');

        assert.equal(imported.title, 'Caminamos con alegría');
        assert.equal(imported.part, 'entrada');
        assert.equal(imported.body, '[C]Caminamos');
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
        const imported = importChordsOverLyrics('C\nCaminamos con alegría\n\nG\nSeñor');

        assert.equal(imported.title, '');
        assert.equal(imported.body, '[C]Caminamos con alegría\n\n[G]Señor');
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

/**
 * Sheets laid out the way a PDF exported from Word or Docs comes out of `pdftotext -layout`:
 * hanging verse numbers, zero-width characters, one song per page, two columns. The words are
 * invented for the tests; the layout is the real thing.
 */
describe('importChordsOverLyrics: sheets as a PDF gives them', () => {
    const ZW = '​';
    const wordsOf = (text: string): string => text.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, '');

    const sheet = [
        'ENTRADA: Caminamos con alegría',
        '',
        '  C',
        '  Caminamos con alegría, Señor,',
        '                         G7',
        '  cantando vamos hacia tu casa.',
        '  F        G            Am',
        '  Con el pan de cada día,',
        '     F       G      C',
        '  te traemos nuestra paz. (BIS)',
        '',
        '    C       Am    Dm',
        '1.  Un pueblo que espera el mañana,',
        '        G         C',
        '    y sabe que Dios está aquí.',
        '',
        '    C       Am',
        '2.  Un pueblo que canta y camina,',
        '        G         C',
        '    sembrando esperanza y amor.',
        '',
        '3.  Un pueblo que reza y trabaja,',
        '    levanta su voz hacia ti.',
    ].join('\n');

    it('puts the chords of a numbered verse on the words, not on the number', () => {
        const body = importChordsOverLyrics(sheet).body;

        assert.match(body, /\{c: Verso 1\}\n\[C\]Un puebl\[Am\]o que \[Dm\]espera el mañana,\n {4}y sa\[G\]be que Dio\[C\]s está aquí/);
        assert.match(body, /\{c: Verso 2\}\n\[C\]Un puebl\[Am\]o que canta/);
    });

    it('reads the header, the labels and the chords of a whole sheet', () => {
        const imported = importChordsOverLyrics(sheet);
        const parsed = parse(imported.body);

        assert.equal(imported.title, 'Caminamos con alegría');
        assert.equal(imported.part, 'entrada');
        assert.ok(parsed.hasChords);
        assert.deepEqual(parsed.sections.filter((s) => s.label !== null).map((s) => s.label), ['Verso 1', 'Verso 2', 'Verso 3']);
    });

    it('does not lose a letter of the lyrics', () => {
        const imported = importChordsOverLyrics(sheet);
        const lyrics = sheet
            .split('\n')
            .slice(1)
            .filter((line) => line.trim() !== '' && !isChordLine(line))
            .map((line) => line.replace(/^\d\.\s+/, ''))
            .join('');

        assert.equal(wordsOf(imported.body.split('\n').filter((l) => !l.startsWith('{')).join('')), wordsOf(lyrics));
    });

    it('ignores the zero-width characters Word leaves between letters', () => {
        const noisy = sheet.replace(/ {2}/g, ` ${ZW} `).replace('1.', `1.${ZW}`);

        assert.equal(importChordsOverLyrics(noisy).body, importChordsOverLyrics(sheet).body);
    });

    describe('two columns', () => {
        const left = [
            'C           G',
            '1.  Cantamos al amanecer',
            '    con la luz de un nuevo día',
            '',
            'C           G',
            '2.  Cantamos al caer la tarde',
            '    con la paz de nuestro hogar',
            '',
            'C           G',
            '3.  Cantamos en el campo',
            '    con la fuerza de la tierra',
        ];
        const right = [
            'Am          F',
            '4.  Cantamos en la noche',
            '    con la fe de nuestra gente',
            '',
            'Am          F',
            '5.  Cantamos con los niños',
            '    y con todos los que vienen',
            '',
            'Am          F',
            '6.  Cantamos sin cansarnos',
            '    hasta el fin de nuestros días',
        ];
        const twoColumns = left.map((line, i) => line.padEnd(44) + (right[i] ?? '')).join('\n');

        it('reads the left column and then the right', () => {
            const imported = importChordsOverLyrics(twoColumns);

            assert.deepEqual(
                parse(imported.body).sections.map((s) => s.label),
                ['Verso 1', 'Verso 2', 'Verso 3', 'Verso 4', 'Verso 5', 'Verso 6'],
            );
            assert.match(imported.body, /\{c: Verso 4\}\n\[Am\]Cantamos \[F\]en la noche/);
            assert.ok(imported.warnings.some((w) => w.includes('dos columnas')));
        });

        it('keeps the chords of each column with its own words', () => {
            const imported = importChordsOverLyrics(twoColumns);

            assert.match(imported.body, /\{c: Verso 1\}\n\[C\]Cantamos \[G\]al amanecer/);
            assert.match(imported.body, /\{c: Verso 5\}\n\[Am\]Cantamos \[F\]con los niños/);
        });

        it('leaves a one-column sheet alone', () => {
            assert.ok(!importChordsOverLyrics(sheet).warnings.some((w) => w.includes('columnas')));
        });
    });
});

describe('importMany', () => {
    const one = (header: string, chords: string, words: string): string => `${header}\n\n${chords}\n${words}\n`;

    it('gives one song per page when the text has page breaks', () => {
        const text = [
            one('ENTRADA: Uno', 'C', 'Letra uno'),
            one('GLORIA', 'Dm', 'Gloria a Dios'),
            one('SALIDA: Tres', 'G', 'Letra tres'),
        ].join('\f');

        const songs = importMany(text);

        assert.deepEqual(songs.map((s) => s.title), ['Uno', 'Gloria', 'Tres']);
        assert.deepEqual(songs.map((s) => s.part), ['entrada', 'gloria', 'salida']);
    });

    it('ignores an empty page, as in a document with a stray blank sheet', () => {
        const text = [one('ENTRADA: Uno', 'C', 'Letra'), '  \n', one('SALIDA: Dos', 'G', 'Letra')].join('\f');

        assert.equal(importMany(text).length, 2);
    });

    it('splits without page breaks where a part is named with a colon', () => {
        const text = one('ENTRADA: Uno', 'C', 'Letra uno') + '\n' + one('OFRENDAS: Dos', 'G', 'Letra dos');

        assert.deepEqual(importMany(text).map((s) => s.title), ['Uno', 'Dos']);
    });

    it('does not take a lyric that starts with a part name for a new song', () => {
        const text = 'SANTO: Alegre\n\nE   A\nSanto, Santo, Santo\nB     E\nSanto es el Señor (2)\n\nA\nSanto es el que viene';

        assert.equal(importMany(text).length, 1);
    });

    it('splits at a title set apart with chords below, like "Santo Alegre"', () => {
        const text = one('ENTRADA: Uno', 'C', 'Letra uno') + '\nSanto Alegre\nE   A\nSanto en el cielo\n';

        assert.deepEqual(importMany(text).map((s) => s.title), ['Uno', 'Santo Alegre']);
    });

    it('is a single song when there is no sign of more', () => {
        assert.equal(importMany('C\nUna sola letra\n').length, 1);
        assert.deepEqual(importMany('  \n'), []);
    });
});

describe('mass parts', () => {
    it('lists the sung parts once, in the order of the Missal', () => {
        assert.deepEqual(
            MASS_PARTS.map((part) => part.id),
            ['entrada', 'senor-ten-piedad', 'gloria', 'salmo', 'aclamacion', 'ofertorio', 'santo', 'memorial', 'amen',
                'padre-nuestro', 'paz', 'cordero', 'comunion', 'accion-de-gracias', 'salida'],
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

    it('has the sign of peace as an optional slot that explains itself', () => {
        const peace = MASS_PARTS.find((part) => part.id === 'paz');

        assert.equal(peace?.optional, true);
        assert.match(peace?.note ?? '', /No es parte de la misa/);
        assert.match(peace?.note ?? '', /en algunas parroquias se incluye/);
    });

    it('marks as optional only the parts a Mass can do without', () => {
        assert.deepEqual(
            MASS_PARTS.filter((part) => part.optional).map((part) => part.id),
            ['salmo', 'memorial', 'amen', 'paz', 'accion-de-gracias'],
        );
    });

    it('recognises the sign of peace on a sheet', () => {
        assert.equal(importChordsOverLyrics('PAZ: Shalom\n\nC\nLetra').part, 'paz');
    });

    it('compares names without accents or case', () => {
        assert.equal(plain('Aclamación  ANTES del Evangelio!'), 'aclamacion antes del evangelio');
    });
});
