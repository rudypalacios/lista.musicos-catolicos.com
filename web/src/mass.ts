import type { PartDef } from './data/types.ts';

/**
 * The parts of the Mass that are sung, in the order of the Roman Missal (Misal Romano). The
 * names are the standard ones; `aliases` are the other names people write on their sheets
 * ("Ofrendas" for the Ofertorio, "Piedad" or "Kyrie" for Señor, ten piedad), used to
 * recognise a part when importing. Compared without accents or case.
 *
 * A setlist carries its own sections (`Setlist.parts`), so the Mass is only what a new list starts from today
 * (`massSections`) and what the importer reads names against. These ids are stored inside the songs of the lists
 * that exist: never rename or remove one.
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
    /** The tag a song carries to be offered first for this part (the picker filters by it) */
    tag: string;
    /** The Mass can be celebrated without a song here (the template shows the slot as optional) */
    optional?: true;
    /** A tooltip explaining the slot, when the person might wonder why it is there */
    note?: string;
}

export const MASS_PARTS: readonly MassPart[] = [
    { id: 'entrada', tag: 'Entrada', name: 'Canto de entrada', aliases: ['entrada', 'canto de entrada', 'antifona de entrada'] },
    {
        id: 'senor-ten-piedad', tag: 'Señor ten piedad',
        name: 'Señor, ten piedad',
        aliases: ['senor ten piedad', 'piedad kyrie', 'kyrie', 'piedad', 'acto penitencial'], fixedText: true },
    { id: 'gloria', tag: 'Gloria', name: 'Gloria', aliases: ['gloria'], fixedText: true },
    { id: 'salmo', tag: 'Salmo', name: 'Salmo responsorial', aliases: ['salmo responsorial', 'salmo'], optional: true },
    {
        id: 'aclamacion', tag: 'Aclamación',
        name: 'Aclamación antes del Evangelio',
        aliases: ['aclamacion antes del evangelio', 'aclamacion al evangelio', 'aclamacion', 'aleluya'],
    },
    {
        id: 'ofertorio', tag: 'Ofertorio',
        name: 'Ofertorio',
        aliases: [
            'presentacion de las ofrendas', 'presentacion de ofrendas', 'presentacion de dones',
            'preparacion de los dones', 'ofertorio', 'ofrendas',
        ],
    },
    { id: 'santo', tag: 'Santo', name: 'Santo', aliases: ['santo'], fixedText: true },
    {
        id: 'memorial', tag: 'Memorial',
        name: 'Aclamación memorial',
        aliases: ['aclamacion despues de la consagracion', 'aclamacion memorial', 'memorial'],
        fixedText: true,
        optional: true,
        note: 'La canta la asamblea justo después de la consagración, cuando el sacerdote dice «Este es el Misterio de la fe». Por ejemplo: «Anunciamos tu muerte, proclamamos tu resurrección, ¡ven, Señor Jesús!».',
    },
    { id: 'amen', tag: 'Amén', name: 'Amén', aliases: ['gran amen', 'amen'], fixedText: true, optional: true },
    { id: 'padre-nuestro', tag: 'Padre nuestro', name: 'Padre nuestro', aliases: ['padre nuestro'], fixedText: true },
    {
        id: 'paz', tag: 'Paz',
        name: 'Rito de la paz',
        aliases: ['rito de la paz', 'saludo de paz', 'canto de paz', 'paz'],
        optional: true,
        note: 'No es parte de la misa: el Misal no prescribe un canto para el saludo de la paz, aunque en algunas parroquias se incluye.',
    },
    { id: 'cordero', tag: 'Cordero de Dios', name: 'Cordero de Dios', aliases: ['cordero de dios', 'cordero'], fixedText: true },
    { id: 'comunion', tag: 'Comunión', name: 'Canto de comunión', aliases: ['canto de comunion', 'comunion'] },
    { id: 'accion-de-gracias', tag: 'Acción de gracias', name: 'Acción de gracias', aliases: ['accion de gracias'], optional: true },
    {
        id: 'salida', tag: 'Salida',
        name: 'Canto de salida',
        aliases: ['canto de salida', 'canto final', 'despedida', 'salida', 'final'],
    },
];

/** The tag of a section of the Mass, by its id ("entrada" → "Entrada"); undefined for any other */
export function massTag(id: string): string | undefined {
    return MASS_PARTS.find((part) => part.id === id)?.tag;
}

/** The Mass as the sections a new list starts with: a copy for each list, never shared between them */
export function massSections(): PartDef[] {
    return MASS_PARTS.map((part) => ({
        id: part.id,
        name: part.name,
        ...(part.optional === true ? { optional: true as const } : {}),
        ...(part.note !== undefined ? { note: part.note } : {}),
    }));
}

/** Lower case, no accents, single spaces: how names are compared */
export function plain(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9ñ]+/g, ' ')
        .trim();
}
