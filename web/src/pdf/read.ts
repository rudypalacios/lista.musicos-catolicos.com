/**
 * Reading a PDF in the browser: pdf.js gives the text items of every page with their position,
 * layout.ts turns them into the text the importer reads. Loaded only when a PDF is chosen (it is
 * a big library), from this same origin: the page's security policy allows nothing else.
 */
import { pageToText, pagesToText, type Measure, type TextItem } from './layout.ts';

/** Set at build time to the URL of the worker bundle (scripts/build.ts) */
declare const __PDF_WORKER_URL__: string;

/** What pdf.js gives per piece of text (only what is used) */
interface PdfItem {
    str?: string;
    transform?: number[];
    width?: number;
    height?: number;
}

export class PdfError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PdfError';
    }
}

/**
 * The text of a PDF, one form feed between pages (what importMany splits on).
 *
 * @throws PdfError with a Spanish message when it cannot be read or has no text
 */
export async function readPdf(file: File): Promise<string> {
    let pdfjs: typeof import('pdfjs-dist/legacy/build/pdf.mjs');
    try {
        pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    } catch {
        throw new PdfError('No se pudo cargar el lector de PDF. Se necesita conexión la primera vez.');
    }
    pdfjs.GlobalWorkerOptions.workerSrc = __PDF_WORKER_URL__;

    const data = new Uint8Array(await file.arrayBuffer());
    // Text only, so no WebAssembly (the page's policy does not allow it) and no fonts to load
    const task = pdfjs.getDocument({ data, useWasm: false, useSystemFonts: false, disableFontFace: true });
    let doc;
    try {
        doc = await task.promise;
    } catch {
        void task.destroy();
        throw new PdfError('No se pudo leer el PDF. ¿Está dañado o tiene contraseña?');
    }

    const measure = canvasMeasure();
    const pages: string[] = [];
    try {
        for (let number = 1; number <= doc.numPages; number++) {
            const page = await doc.getPage(number);
            const content = await page.getTextContent();
            pages.push(pageToText(toItems(content.items as PdfItem[]), measure));
            page.cleanup();
        }
    } finally {
        void task.destroy();
    }

    if (pages.every((page) => page.trim() === '')) {
        throw new PdfError('Este PDF no tiene texto (parece una imagen escaneada). Prueba con el PDF original.');
    }

    return pagesToText(pages);
}

/** pdf.js items to the layout's: position from the transform matrix, text that is not rotated */
function toItems(items: readonly PdfItem[]): TextItem[] {
    const out: TextItem[] = [];
    for (const item of items) {
        const [a = 0, b = 0, , , x = 0, y = 0] = item.transform ?? [];
        if (item.str === undefined || item.width === undefined || item.height === undefined || Math.abs(b) > 0.1 || a === 0) {
            continue;
        }
        out.push({ str: item.str, x, y, width: item.width, height: item.height });
    }

    return out;
}

/**
 * The width of a letter, from the browser's own canvas. It is not the PDF's font, and does not
 * need to be: layout.ts scales each line to the width the PDF says it has, so only the ratios
 * between letters count, and those are alike in all the sans-serif fonts a sheet uses.
 */
function canvasMeasure(): Measure {
    const context = document.createElement('canvas').getContext('2d');
    const cache = new Map<string, number>();
    if (context !== null) {
        context.font = '100px sans-serif';
    }

    return (char, size) => {
        let ratio = cache.get(char);
        if (ratio === undefined) {
            ratio = context !== null ? context.measureText(char).width / 100 : 0.55;
            cache.set(char, ratio);
        }

        return ratio * size;
    };
}
