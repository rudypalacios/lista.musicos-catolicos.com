import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ocrLabel, ocrPercent, type OcrStage } from '../../src/ocr/progress.ts';

describe('ocrPercent', () => {
    it('moves from 0 to 100 through the stages, never back', () => {
        const order: OcrStage[] = ['prepare', 'engine', 'letters', 'chords', 'layout'];
        let last = -1;
        for (const stage of order) {
            for (const fraction of [0, 0.5, 1]) {
                const percent = ocrPercent(stage, fraction);
                assert.ok(percent >= last, `${stage} ${fraction}: ${percent} after ${last}`);
                last = percent;
            }
        }
        assert.equal(ocrPercent('prepare', 0), 0);
        assert.equal(ocrPercent('layout', 1), 100);
    });

    it('keeps an odd fraction inside its stage', () => {
        assert.equal(ocrPercent('engine', -3), 5);
        assert.equal(ocrPercent('engine', 7), 45);
        assert.equal(ocrPercent('engine', Number.NaN), 5);
    });
});

describe('ocrLabel', () => {
    it('says the reader is downloaded only the first time', () => {
        assert.match(ocrLabel('engine', false), /Descargando el lector/);
        assert.match(ocrLabel('engine', true), /Abriendo el lector/);
    });

    it('names what each stage reads', () => {
        assert.match(ocrLabel('letters', true), /letra/);
        assert.match(ocrLabel('chords', true), /acordes/);
    });
});
