/**
 * What the golden fixtures are made from: songs, chord names and words chosen to hit every
 * branch of the parser, the renderer, the chord rules and the syllable splitter. The PHP of
 * musicos-catolicos (and its song.js) answers for each one; the port must answer the same.
 * Add a case whenever a bug shows a branch these do not reach.
 */

export const SONGS: Record<string, string> = {
    empty: '',
    blankOnly: '  \n\n \t\n',
    plainLyrics: 'Uno\nDos\n\n\nTres',
    chordsAndMeta:
        '{title: Ignorado}\n{key: G}\n{capo: 2}\n{tempo: 72}\n{time: 4/4}\n\n{c: Verso 1}\n\n'
        + '[G]Primera línea [D/F#]del verso\nSegunda sin acordes\n\n'
        + '{soc}\n[C]Coro\n{eoc}\n# nota del editor\n{chorus}\nFinal',
    latinChords: '[Sol]Uno [Re/Fa#]dos []tres',
    keyLatin: '{key: Sol}\n[C]Uno',
    keyMinor: '{key: Am}\n[C]Uno',
    firstChordMinor: '[Em7]Uno [C]dos',
    emptyKey: '{key:}\n{capo: }\n[D]Uno',
    htmlEscaping: '{c: Coro}\n[G]Cuánto he es[D]perado <b> & "comillas" \'simples\'\nSin acordes <i>',
    chorusEnvironment:
        '{soc}\n[G]Primera\n\n[D]Segunda estrofa del coro\n{eoc}\n[C]Verso suelto',
    startOfChorusLabelled: '{start_of_chorus: Coro 2}\n[G]Uno\n{end_of_chorus}\nDos',
    bridge: '{sob}\n[Am]Puente\n{eob}\n{start_of_bridge: Puente largo}\n[F]Otro\n{end_of_bridge}',
    verseEnvironment: '{sov: Solista}\n[G]Canta uno\n{eov}\n{start_of_verse}\n[C]Canta otro\n{end_of_verse}',
    labelsByKind:
        '{c: Coro}\n[G]Uno\n\n{c: Estribillo}\n[D]Dos\n\n{c: Intro}\n[C]Tres\n\n{c: Introducción}\n[F]Cuatro\n\n'
        + '{c: Interludio instrumental}\n[Am]Cinco\n\n{c: Precoro}\n[G]Seis\n\n{c: Final}\n[C]Siete\n\n'
        + '{c: Verso 2}\nOcho\n\n{c: Estrofa 3}\nNueve\n\n{c: Todos}\nDiez\n\n{c: Solo de guitarra}\n[E]Once',
    labelAlternatives: '{comment: Coro}\nUno\n{cb: Puente}\nDos\n{comment_box: Verso 1}\nTres',
    annotations: '{c: Coro}\n[G]Hosanna\n{ci: x2}\n\n{comment_italic: Repetir coro}\n\nSin sección {ci: ignorada}',
    noteAtEnd: '[C]aleluya, [G]aleluya {ci: bis}\n{ci: x2}',
    noteOnPlainLine: 'Sin acordes {comment_italic: (Bis)}\nOtra {CI: 2ª vez}',
    noteInTheMiddle: 'Uno {ci: bis} dos',
    noteEmptyAtEnd: 'Uno {ci: }\nDos {ci}\nTres {ci:}',
    noteSpacing: '[G]Uno    {ci:   2ª vez   }   ',
    noteTwoAtEnd: 'Uno {ci: a} dos {ci: b}',
    noteEscaped: '[G]Hola {ci: <b> & "x"}',
    noteAfterAChord: '[G]Hola [D]{ci: bis}',
    noteOnAChordsOnlyLine: '{c: Intro}\n[G] [D] {ci: dos veces}\n[G]Letra',
    noteOnAnEmptyBracket: '[] {ci: solo}',
    noteBeforeABlankLine: '[C]Primera {ci: bis}\n\n[G]Segunda',
    noteInAChorus: '{soc}\n[G]Coro {ci: 2ª vez}\n{eoc}\nVerso {ci: bis}',
    parenChords: '[C]aleluya [Sol]aleluya [(G)]ya [( Re )]x [(x2)]y [G(add9)]z [(Sol)]',
    parenChordFirst: '[(Em7)]Uno [C]dos',
    parenChordLine: '[C]aleluya [Em]aleluya [F]a [G]le [C]lu [(G)]ya {ci: bis}',
    annotationFirst: '{ci: antes de todo}\n[G]Luego la letra',
    annotationEmptyValue: '{ci}\n{c}\n[G]Uno',
    chorusRepeat: '{soc}\n[G]Coro\n{eoc}\nVerso\n{chorus}\n{chorus: Repetir el coro}\nFin',
    labelThenBlank: '{c: Coro}\n\n[G]Después de la línea en blanco',
    uppercaseDirectives: '{SOC}\n[G]Uno\n{EOC}\n{Key: C}\n{C: Verso}\nDos',
    indentedDirectives: '   {soc}  \n  [G]Uno\n  {eoc}\n\t{c:  Verso 9  }\nDos',
    unknownDirectives: '{title: X}\n{artist: Y}\n{define: G base-fret 1}\n[G]Uno\n{unknown_thing: z}\n{notadirective\nDos',
    comments: '# comentario\n  # otro con sangría\n[G]Letra\n#[D]no es acorde',
    crlf: '{c: Coro}\r\n[G]Uno\r\n\r\n[D]Dos\r\n',
    oldMacLineBreaks: '[G]Uno\r[D]Dos',
    nonBreakingSpaces: '[G]\u00A0Uno\u00A0\n\u00A0\n[D]Dos',
    trailingSpacesAndTabs: '[G]Uno  \t \n[D]Dos\t',
    unicodeLyrics: '[Em]Señor, ¿qué ñandú comió? Ünder ÁÉÍÓÚ — «guión» …',
    emptyBrackets: '[]Sin acorde [G]con uno [] y vacío al final []',
    spacedChords: '[ G ]Uno [  D/F#  ]dos',
    unmatchedBracket: '[G]Uno [D dos',
    notAChord: '[N.C.]Silencio [x2]repetir [Fadd9]Fa [Faug]aum [Fa#m7]latín',
    chordOnly: '[G] [D] [Em] [C]',
    introLine: '{c: Intro}\n[G] [D] [Em] [C]\n\n{c: Verso}\n[G]Letra',
    chordsAfterLastWord: '[G]Así [D] [Em]\n[C]Vamos [G]ya [D]',
    twoChordsInARow: '[G][D]más [Em][C]allá',
    chordMidWord: 'pa[D]labra y pru[Am]eba',
    chordAtLineEnd: 'Hasta el final [G]',
    chordOverSpace: '[G] Uno [D] dos',
    chordOverPunctuation: '[G], Uno [D]. dos [Em]¡Hey!',
    syllableAcrossSegments: 'es[G]pe[D]rado ha[Em]blar hom[C]bre',
    longWordsAndClusters: '[G]Construir [D]perro [Em]queremos [C]guitarra [Am]poeta [F]Dios [G]rey',
    multipleSpaces: '[G]Uno   dos    tres\n[D]  empieza con espacios',
    tabsInLyrics: '[G]Uno\tdos\t[D]tres',
    sectionsWithoutLabelsNumbered: 'Uno\n\nDos\n\nTres',
    caminamosConAlegria:
        '{key: C}\n{c: Coro}\n[C]Caminamos con alegría, Señor,\ncantando vamos hacia tu ca[C7]sa.\n'
        + '[F]Con el pan de [G]cada día, te [Em]traemos [Am]paz,\ntra[Dm]bajo de [G]todos y [C]vida. (BIS)\n\n'
        + '{c: Verso 1}\n[C]Un pueblo que es[Am]pe[Dm]ra el mañana,\ny [G]sabe que [Dm]Dios está a[C]quí.\n'
        + 'Un pueblo que [Am]can[Dm]ta y camina,\nsem[G]brando es[F]peranza y a[C]mor.',
    senorTenPiedad:
        '{key: Am}\n[Am]Seeee[Dm]ñor ten [G]piedad,\n[C]Señor ten [Am]piedad,\n[Dm]Señor ten [E]piedad, ten [Am]piedad\n\n'
        + '[Am]Cristo ten [Dm]piedad, ten piedad, ten [G]piedad',
    padreNuestro:
        '{c: Padre Nuestro}\n{capo: 2}\n[Re]Padre nuestro [Sol]que estás en el [Re]cielo\n'
        + '[Sol]Santificado [Mim]sea tu nombre [La]\n[Re]No nos dejes [Re7]caer [Sol]en la [Solm]tentación',
    cordero:
        '{c: Verso 1}\n[Rem]Cordero de [Sib]Dios,\nque quitas el [Solm]pecado del [La7]mundo.\n'
        + '[Rem]Ten piedad de [Do]nosotros [Rem]\n{ci: (2)}\n\n{c: Verso 2}\n[Rem]Cordero de [Sib]Dios',
    mesaCompartida:
        '{c: Coro}\n[Am]Sobre la mesa com[Dm]partimos el [Am]pan, y [G]en [G7]ella está [C]Dios,\n'
        + '[Dm]en ella [E]está el [Am]Señor. ([E] [Am])\n\n{c: Verso 1}\n[Am]Una mesa con [G]sillas, [G7]una [C]luz, [Dm]sencilla y viva,',
};

/** Chord names: roots, accidentals, qualities, slash chords, Latin input, and what is not a chord */
export const CHORDS: string[] = [
    ...['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'],
    ...['Am', 'F#m', 'Bbm', 'Em7', 'Cmaj7', 'Cm7b5', 'G7', 'D7sus4', 'Asus2', 'Csus4', 'Fadd9', 'Faug', 'Cdim', 'E5'],
    ...['D/F#', 'G/B', 'C/E', 'Am/G', 'F#m7/C#', 'Bb/D', 'C/Bb', 'E/G#'],
    ...['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si', 'Do#', 'Reb', 'Fa#m7', 'Sibmaj7', 'Re/Fa#', 'sol', 'SOL', 'MIm', 'SIm', 'Rem', 'Solm', 'La7'],
    ...['Dosus4', 'Lam', 'Mi7', 'Sib', 'FA#', 'RE7', 'mi/sol#'],
    ...['N.C.', 'x2', '', ' G ', '(G)', '(Sol)', '(F#m7)', '( G )', '(D/F#)', '(Re/Fa#)', '(x2)', '(sol)', '()', '( )', '(G', 'G)', '((G))', 'G(add9)', '(G)/B', 'A-', 'D-', 'H', 'G/', '/G', 'Gmaj7/', 'Xyz', 'e', 'a', 'Cb', 'E#', 'B#', 'Fb'],
];

/** Words (and fragments) for the syllable splitter: what follows a chord, starting where it falls */
export const WORDS: string[] = [
    'primera', 'esperado', 'cuanto', 'Dios', 'ía', 'poeta', 'hablar', 'hombre', 'construir', 'mucho', 'perro',
    'queremos', 'guitarra', 'rey', 'yo', 'a', 'Cuánto', 'te amo', 'sí, Señor', ' del verso', ', amén', '',
    'alegría', 'Señor', 'cantando', 'vienen', 'trayendo', 'esperanza', 'mundo', 'cargado', 'ansiedad', 'busca',
    'alcanza', 'caminos', 'amistad', 'amor', 'sembrando', 'piedad', 'Cristo', 'Gloria', 'Aleluya', 'Hosanna',
    'bendito', 'nombre', 'cielo', 'tentación', 'líbranos', 'mal', 'Cordero', 'quitas', 'pecado', 'nosotros',
    'danos', 'paz', 'comunión', 'caridad', 'allí', 'sala', 'mesa', 'copa', 'vino', 'pan', 'María', 'tinieblas',
    'mediodía', 'palabra', 'labios', 'alumbra', 'doncella', 'prometía', 'volcán', 'ternura', 'divina',
    'primavera', 'Redentor', 'estalló', 'tierra', 'vientre', 'latía', 'Salvación', 'hágase', 'corazón',
    'voluntad', 'cumplan', 'sueños', 'ñandú', 'Ünder', 'pingüino', 'agüita', 'quiero', 'guerra', 'águila',
    'cruz', 'fuego', 'ciudad', 'reino', 'seis', 'aire', 'peine', 'baúl', 'país', 'maíz', 'oído', 'leer', 'creer',
    'transformar', 'obstáculo', 'instrumento', 'abstracto', 'inscribir', 'perspectiva', 'extraordinario',
    'ay', 'hoy', 'muy', 'y', 'mayo', 'yema', 'ya', 'Yahvé', 'Jesús', 'Jesucristo', 'Espíritu', 'Santo', 'Padre',
    '123', '¡Hey!', '(BIS)', 'x', 'ç', 'ß',
];

/**
 * Songs and headings for the print cascade (PrintLayout). The sweeps walk a song from a few
 * lines to many pages, so every threshold between normal, compact, columns and pages is crossed,
 * with and without chords; the headings make the header take one, two and three rows.
 */
export const PRINT_SONGS: Record<string, string> = (() => {
    const songs: Record<string, string> = { ...SONGS };
    const withChords = '[G]Cuánto he espe[D]rado este mo[Em]mento\n';
    const plain = 'Cuánto he esperado este momento\n';
    for (let stanzas = 1; stanzas <= 40; stanzas++) {
        songs[`sweepStanzasChords${stanzas}`] = Array(stanzas).fill(withChords.repeat(4)).join('\n');
        songs[`sweepStanzasPlain${stanzas}`] = Array(stanzas).fill(plain.repeat(4)).join('\n');
    }
    for (let lines = 1; lines <= 90; lines += 1) {
        songs[`sweepLinesChords${lines}`] = withChords.repeat(lines);
        songs[`sweepLinesPlain${lines}`] = plain.repeat(lines);
    }
    // Rows that wrap: the same line, longer and longer
    for (let words = 4; words <= 40; words += 4) {
        songs[`sweepWrap${words}`] = ('[Am]Caminamos con ale[E]gría, Señor, '.repeat(words / 4) + '\n').repeat(12);
    }
    songs['verseLabelsAndChorus'] = '{c: Verso 1}\n' + withChords.repeat(6) + '\n{c: Coro}\n' + withChords.repeat(6)
        + '\n{c: Verso 2}\n' + withChords.repeat(6) + '\n{c: Puente}\n' + withChords.repeat(6) + '\n{ci: x2}\n';
    songs['notesAtTheEnd'] = '{c: Coro}\n' + '[C]aleluya, [G]aleluya {ci: bis}\n'.repeat(8)
        + '[Am]Caminamos con ale[E]gría, Señor, y cantamos con fe en el camino de la paz {ci: 2ª vez}\n'.repeat(4);
    songs['notesAtTheEndPlain'] = 'x'.repeat(66) + ' {ci: bis}\n' + 'x'.repeat(60) + ' {ci: bis}\n';
    songs['introsAndAnnotations'] = '{c: Intro}\n[G] [D] [Em]\n\n{c: Verso}\n' + withChords.repeat(14) + '{ci: (BIS)}\n'.repeat(6);

    return songs;
})();

/** [title, subtitle] pairs: a short header, and ones that wrap to a second and a third row */
export const PRINT_HEADINGS: [string, string][] = [
    ['', ''],
    ['Cántico de la creación', 'Autor Conocido'],
    ['Un título muy largo que se parte en dos filas de la cabecera', 'Un artista · Un disco con nombre largo (2024)'],
    ['Ñandú '.repeat(30), 'Señor '.repeat(40)],
];
