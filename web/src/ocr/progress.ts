/**
 * What the bar and the sentence say while a photo is read. Reading goes through stages, each a share of the bar; inside
 * a stage the reader says how far it is (0 to 1). Pure, so the bar can be tested without reading anything.
 */
export type OcrStage = 'prepare' | 'engine' | 'letters' | 'chords' | 'layout';

/** Where each stage starts and ends on the bar (percent). The engine is the long one the first time: it is downloaded */
const SHARE: Record<OcrStage, readonly [number, number]> = {
    prepare: [0, 5],
    engine: [5, 45],
    letters: [45, 75],
    chords: [75, 97],
    layout: [97, 100],
};

/** How full the bar is, 0 to 100 */
export function ocrPercent(stage: OcrStage, fraction: number): number {
    const [from, to] = SHARE[stage];
    const inside = Math.min(Math.max(Number.isFinite(fraction) ? fraction : 0, 0), 1);

    return Math.round(from + (to - from) * inside);
}

/**
 * The sentence for a stage. `cached`: the reader is already on the device (it was downloaded before), so opening it is
 * quick and needs no connection; otherwise it says it is downloading, which only happens the first time.
 */
export function ocrLabel(stage: OcrStage, cached: boolean): string {
    switch (stage) {
        case 'prepare':
            return 'Preparando la imagen…';
        case 'engine':
            return cached ? 'Abriendo el lector…' : 'Descargando el lector (solo la primera vez, unos 6 MB)…';
        case 'letters':
            return 'Leyendo la letra…';
        case 'chords':
            return 'Leyendo los acordes…';
        case 'layout':
            return 'Poniendo cada acorde sobre su sílaba…';
    }
}
