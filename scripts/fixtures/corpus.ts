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
    vienenConAlegria:
        '{key: C}\n{c: Coro}\n[C]Vienen con alegría Señor,\ncantando vienen con ale[C7]gría Señor.\n'
        + '[F]Los que cami[G]nan por la [Em]vida Se[Am]ñor,\nsem[Dm]brando tu [G]paz y a[C]mor. (BIS)\n\n'
        + '{c: Verso 1}\n[C]Vienen trayendo la espe[Am]ran[Dm]za,\na un [G]mundo carga[Dm]do de ansie[C]dad.\n'
        + 'Un mundo que busca y que no al[Am]can[Dm]za,\ncami[G]nos de a[F]mor y de ami[C]stad.',
    senorTenPiedad:
        '{key: Am}\n[Am]Seeee[Dm]ñor ten [G]piedad,\n[C]Señor ten [Am]piedad,\n[Dm]Señor ten [E]piedad, ten [Am]piedad\n\n'
        + '[Am]Cristo ten [Dm]piedad, ten piedad, ten [G]piedad',
    padreNuestro:
        '{c: Padre Nuestro}\n{capo: 2}\n[Re]Padre nuestro [Sol]que estás en el [Re]cielo\n'
        + '[Sol]Santificado [Mim]sea tu nombre [La]\n[Re]No nos dejes [Re7]caer [Sol]en la [Solm]tentación',
    cordero:
        '{c: Verso 1}\n[Rem]Cordero de [Sib]Dios,\nque quitas el [Solm]pecado del [La7]mundo.\n'
        + '[Rem]Ten piedad de [Do]nosotros [Rem]\n{ci: (2)}\n\n{c: Verso 2}\n[Rem]Cordero de [Sib]Dios',
    comunion:
        '{c: Coro}\n[Am]Donde hay cari[Dm]dad y a[Am]mor, a[G]llí es[G7]tá el Se[C]ñor,\n'
        + '[Dm]allí [E]está el [Am]Señor. ([E] [Am])\n\n{c: Verso 1}\n[Am]Una sala y una [G]mesa, [G7]una [C]copa, [Dm]vino y pan,',
};

/** Chord names: roots, accidentals, qualities, slash chords, Latin input, and what is not a chord */
export const CHORDS: string[] = [
    ...['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'],
    ...['Am', 'F#m', 'Bbm', 'Em7', 'Cmaj7', 'Cm7b5', 'G7', 'D7sus4', 'Asus2', 'Csus4', 'Fadd9', 'Faug', 'Cdim', 'E5'],
    ...['D/F#', 'G/B', 'C/E', 'Am/G', 'F#m7/C#', 'Bb/D', 'C/Bb', 'E/G#'],
    ...['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si', 'Do#', 'Reb', 'Fa#m7', 'Sibmaj7', 'Re/Fa#', 'sol', 'SOL', 'MIm', 'SIm', 'Rem', 'Solm', 'La7'],
    ...['Dosus4', 'Lam', 'Mi7', 'Sib', 'FA#', 'RE7', 'mi/sol#'],
    ...['N.C.', 'x2', '', ' G ', '(G)', 'A-', 'D-', 'H', 'G/', '/G', 'Gmaj7/', 'Xyz', 'e', 'a', 'Cb', 'E#', 'B#', 'Fb'],
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
