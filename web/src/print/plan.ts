import { transpose, type Notation } from '../chordpro/chord.ts';
import { parse, songKey, type Sheet } from '../chordpro/parser.ts';
import type { Song } from '../data/types.ts';
import { printLayout, type PrintLayoutName, type PrintVersion } from './layout.ts';

/** A line of the musical data under the title ("Tono" Sol) */
export interface NoteItem {
    label: string;
    value: string;
}

/** Everything a printed page needs, decided before any markup is made */
export interface SheetPlan {
    title: string;
    /** What the header prints beside the title; PrintLayout measures this same text */
    subtitle: string;
    version: PrintVersion;
    layout: PrintLayoutName;
    note: NoteItem[];
    sheet: Sheet;
    shift: number;
    notation: Notation;
}

export interface PlanOptions {
    /** The sheet asked for; a song without chords has only the lyrics */
    version: PrintVersion;
    /** Semitones from the song's own key (the setlist's or the one on screen) */
    shift: number;
    notation: Notation;
    /** The part of the Mass, for the header of a setlist's page */
    part?: string;
}

/** Decides how one song prints: the sheet, the header, and how it fits the page */
export function planSheet(song: Song, options: PlanOptions): SheetPlan {
    const sheet = parse(song.body);
    const version: PrintVersion = sheet.hasChords ? options.version : 'lyrics';
    const subtitle = [song.author, options.part ?? ''].filter((text) => text !== '').join(' · ');

    return {
        title: song.title,
        subtitle,
        version,
        layout: printLayout(sheet, version, song.title, subtitle),
        note: version === 'chords' ? noteOf(sheet, options.shift, options.notation) : [],
        sheet,
        shift: options.shift,
        notation: options.notation,
    };
}

/** The musical data the public site prints under the title: key (in the key it prints), capo, time, tempo */
function noteOf(sheet: Sheet, shift: number, notation: Notation): NoteItem[] {
    const note: NoteItem[] = [];
    const key = songKey(sheet);
    if (key !== null) {
        note.push({ label: 'Tono', value: transpose(key, shift, notation) });
    }
    const capo = text(sheet.meta['capo']);
    if (capo !== null) {
        note.push({ label: 'Capo', value: capo });
    }
    const time = text(sheet.meta['time']);
    if (time !== null) {
        note.push({ label: 'Compás', value: time });
    }
    const tempo = text(sheet.meta['tempo']);
    if (tempo !== null) {
        // "72" → "72 BPM", which needs no label; anything worded ("Lento") keeps "Tempo"
        note.push(/^\d+$/.test(tempo) ? { label: '', value: `${tempo} BPM` } : { label: 'Tempo', value: tempo });
    }

    return note;
}

function text(value: string | undefined): string | null {
    const trimmed = value?.trim() ?? '';

    return trimmed === '' ? null : trimmed;
}
