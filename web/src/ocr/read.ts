/**
 * Reading a photo of a sheet in the browser: Tesseract (a character reader that runs on the device) reads the picture
 * twice, words.ts puts the two readings together, and the text goes to the importer like a pasted one. Nothing leaves
 * the device. Loaded only when an image is chosen (the reader is big), from this same origin: the page's security policy
 * allows nothing else, and its WebAssembly (`wasm-unsafe-eval`) is what the reader runs on.
 *
 * Its files are put in /assets/ocr/ by the build (scripts/build.ts): the worker, the engine (two builds: with and
 * without SIMD, the browser says which it can run) and the Spanish language data.
 */
import { canvasMeasure } from '../pdf/measure.ts';
import { ocrLabel, ocrPercent, type OcrStage } from './progress.ts';
import { chordAlphabet, ocrToText, type OcrWord } from './words.ts';

/** Where the build puts the reader's files */
const ASSETS = '/assets/ocr';

/** The longest side of the picture the reader sees, in pixels: a phone's 12 megapixels are slow to read and no more legible */
const MAX_SIDE = 2800;

/** A photo larger than this is not a photo of a sheet (the phone's own camera gives 2 to 8 MB) */
const MAX_BYTES = 30 * 1024 * 1024;

/** The reading did not work; `message` is for the person, in Spanish */
export class OcrError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'OcrError';
    }
}

export interface OcrProgress {
    /** How full the bar is, 0 to 100 */
    percent: number;
    /** What is being done, as a sentence */
    label: string;
}

/**
 * The text of a photo of a sheet, as the importer reads it (see ocrToText).
 *
 * @param onProgress called as the reading advances, so the screen can show a bar that really moves
 * @throws OcrError with a Spanish message when the image cannot be opened, the reader cannot be loaded or nothing is read
 */
export async function readImage(file: File, onProgress?: (progress: OcrProgress) => void): Promise<string> {
    if (!file.type.startsWith('image/')) {
        throw new OcrError('Este archivo no parece una imagen. Elige una foto o una captura (JPG o PNG).');
    }
    if (file.size > MAX_BYTES) {
        throw new OcrError('La imagen es demasiado grande. Prueba con una foto de menos de 30 MB.');
    }

    let cached = false;
    const say = (stage: OcrStage, fraction: number): void => onProgress?.({ percent: ocrPercent(stage, fraction), label: ocrLabel(stage, cached) });

    say('prepare', 0);
    const picture = await prepare(file);
    say('prepare', 1);

    let tesseract: typeof import('tesseract.js');
    try {
        // The package is CommonJS: once it is bundled, what it exports is the module's `default`
        const loaded: unknown = await import('tesseract.js');
        tesseract = ((loaded as { default?: typeof tesseract }).default ?? loaded) as typeof tesseract;
    } catch {
        throw new OcrError('No se pudo cargar el lector de imágenes. Leer una imagen necesita conexión la primera vez; pegar el texto funciona sin ella.');
    }

    // What the reader says about itself, as a stage of the bar: opening it, then reading
    let reading: OcrStage = 'engine';
    const logger = (message: { status: string; progress: number }): void => {
        if (message.status.includes('from cache')) {
            cached = true;
        }
        if (message.status === 'recognizing text') {
            say(reading, message.progress);
        } else if (/loading|initializing/.test(message.status)) {
            say('engine', message.progress);
        }
    };

    say('engine', 0);
    let worker: Awaited<ReturnType<typeof tesseract.createWorker>>;
    try {
        worker = await tesseract.createWorker('spa', tesseract.OEM.LSTM_ONLY, {
            workerPath: `${ASSETS}/worker.min.js`,
            corePath: ASSETS,
            langPath: ASSETS,
            // The page's policy has no blob: scripts: the worker is a file of this origin
            workerBlobURL: false,
            gzip: true,
            logger,
        });
    } catch {
        throw new OcrError('No se pudo abrir el lector de imágenes. Si es la primera vez, necesita conexión; pegar el texto funciona sin ella.');
    }

    try {
        reading = 'letters';
        say('letters', 0);
        const letters = wordsOf(await worker.recognize(picture, {}, { blocks: true }));

        // The second pass reads only what a chord is made of, in the sparse mode (text scattered over the page, no lines)
        reading = 'chords';
        say('chords', 0);
        await worker.setParameters({ tessedit_char_whitelist: chordAlphabet(letters), tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT });
        const chords = wordsOf(await worker.recognize(picture, {}, { blocks: true }));

        say('layout', 0);
        if (letters.length < 3) {
            throw new OcrError('No se pudo leer texto en la imagen. Prueba con más luz y la hoja de frente.');
        }
        const text = ocrToText(letters, chords, canvasMeasure());
        say('layout', 1);

        return text;
    } finally {
        void worker.terminate();
    }
}

/** What the reader found, as words with their boxes and the angle of their line */
function wordsOf(result: { data: { blocks: import('tesseract.js').Block[] | null } }): OcrWord[] {
    const words: OcrWord[] = [];
    let line = 0;
    for (const block of result.data.blocks ?? []) {
        for (const paragraph of block.paragraphs) {
            for (const row of paragraph.lines) {
                line += 1;
                const baseline = row.baseline;
                const slope = baseline.has_baseline ? Math.atan2(baseline.y1 - baseline.y0, baseline.x1 - baseline.x0) : null;
                for (const word of row.words) {
                    words.push({ text: word.text, confidence: word.confidence, line, box: word.bbox, slope });
                }
            }
        }
    }

    return words;
}

/**
 * The picture as a canvas no larger than MAX_SIDE. It is read as a data: URL because the page's policy allows images
 * from data: and not from blob:; the browser turns a photo the right way up by its EXIF note when it draws it.
 */
async function prepare(file: File): Promise<HTMLCanvasElement> {
    const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    }).catch(() => {
        throw new OcrError('No se pudo abrir la imagen.');
    });

    const image = new Image();
    image.src = url;
    try {
        await image.decode();
    } catch {
        throw new OcrError('No se pudo abrir la imagen. Prueba con una foto JPG o PNG.');
    }

    const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (context === null) {
        throw new OcrError('No se pudo preparar la imagen en este dispositivo.');
    }
    // A sheet is black on white: a transparent background (a PNG capture) must not read as black
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas;
}
