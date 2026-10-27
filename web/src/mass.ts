/**
 * The parts of the Mass that are sung, in the order of the Roman Missal (Misal Romano). The
 * names are the standard ones; `aliases` are the other names people write on their sheets
 * ("Ofrendas" for the Ofertorio, "Piedad" or "Kyrie" for Señor, ten piedad), used to
 * recognise a part when importing. Compared without accents or case.
 *
 * The Mass template of a setlist (next phase) is built from this list.
 */
export interface MassPart {
    id: string;
    /** What the app shows */
    name: string;
    aliases: readonly string[];
    /**
     * The words are fixed by the liturgy (Gloria, Santo, Padre nuestro…), so what follows the
     * part's name on a sheet is the musical setting or its author ("Misa Rítmica Mejía"), not a
     * title. For the others (entrada, ofertorio, comunión…) it is the title of the song.
     */
    fixedText?: true;
}

export const MASS_PARTS: readonly MassPart[] = [
    { id: 'entrada', name: 'Canto de entrada', aliases: ['entrada', 'canto de entrada', 'antifona de entrada'] },
    {
        id: 'senor-ten-piedad',
        name: 'Señor, ten piedad',
        aliases: ['senor ten piedad', 'piedad kyrie', 'kyrie', 'piedad', 'acto penitencial'], fixedText: true },
    { id: 'gloria', name: 'Gloria', aliases: ['gloria'], fixedText: true },
    { id: 'salmo', name: 'Salmo responsorial', aliases: ['salmo responsorial', 'salmo'] },
    {
        id: 'aclamacion',
        name: 'Aclamación antes del Evangelio',
        aliases: ['aclamacion antes del evangelio', 'aclamacion al evangelio', 'aclamacion', 'aleluya'],
    },
    {
        id: 'ofertorio',
        name: 'Ofertorio',
        aliases: [
            'presentacion de las ofrendas', 'presentacion de ofrendas', 'presentacion de dones',
            'preparacion de los dones', 'ofertorio', 'ofrendas',
        ],
    },
    { id: 'santo', name: 'Santo', aliases: ['santo'], fixedText: true },
    {
        id: 'memorial',
        name: 'Aclamación memorial',
        aliases: ['aclamacion despues de la consagracion', 'aclamacion memorial', 'memorial'], fixedText: true },
    { id: 'amen', name: 'Amén', aliases: ['gran amen', 'amen'], fixedText: true },
    { id: 'padre-nuestro', name: 'Padre nuestro', aliases: ['padre nuestro'], fixedText: true },
    { id: 'cordero', name: 'Cordero de Dios', aliases: ['cordero de dios', 'cordero'], fixedText: true },
    { id: 'comunion', name: 'Canto de comunión', aliases: ['canto de comunion', 'comunion'] },
    { id: 'accion-de-gracias', name: 'Acción de gracias', aliases: ['accion de gracias'] },
    {
        id: 'salida',
        name: 'Canto de salida',
        aliases: ['canto de salida', 'canto final', 'despedida', 'salida', 'final'],
    },
];

/** Lower case, no accents, single spaces: how names are compared */
export function plain(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9ñ]+/g, ' ')
        .trim();
}
