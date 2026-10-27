<?php

/**
 * Runs the real ChordPro, ChordSheet, Chord and Syllable of musicos-catolicos over the corpus
 * and prints what they answer, as JSON. Called by scripts/fixtures/generate.ts:
 *
 *     php golden.php <path to the musicos-catolicos checkout> <corpus.json>
 */

declare(strict_types=1);

[, $site, $corpusFile] = $argv + [null, null, null];
if ($site === null || $corpusFile === null) {
    fwrite(STDERR, "usage: php golden.php <musicos-catolicos path> <corpus.json>\n");
    exit(1);
}

foreach (['Chord', 'Syllable', 'ChordPro', 'ChordSheet'] as $class) {
    require $site . '/src/Application/Song/' . $class . '.php';
}

use App\Application\Song\Chord;
use App\Application\Song\ChordPro;
use App\Application\Song\ChordSheet;
use App\Application\Song\Syllable;

$corpus = json_decode((string) file_get_contents($corpusFile), true, 512, JSON_THROW_ON_ERROR);

$songs = [];
foreach ($corpus['songs'] as $name => $source) {
    $sheet = ChordPro::parse($source);
    $songs[] = [
        'name' => $name,
        'input' => $source,
        'sheet' => [
            'sections' => $sheet['sections'],
            'meta' => (object) $sheet['meta'],
            'hasChords' => $sheet['has_chords'],
            'firstChord' => $sheet['first_chord'],
        ],
        'html' => ChordSheet::html($sheet),
        'key' => ChordPro::key($sheet),
    ];
}

$labels = [];
foreach ($corpus['labels'] as $label) {
    $labels[] = ['label' => $label, 'kind' => ChordPro::kindOf($label), 'isVerseLabel' => ChordPro::isVerseLabel($label)];
}

$chords = [];
foreach ($corpus['chords'] as $chord) {
    $chords[] = [
        'input' => $chord,
        'english' => Chord::english($chord),
        'latin' => Chord::latin($chord),
        'key' => Chord::key($chord),
    ];
}

$words = [];
foreach ($corpus['words'] as $word) {
    $words[] = ['word' => $word, 'length' => Syllable::firstLength($word)];
}

echo json_encode(
    ['songs' => $songs, 'labels' => $labels, 'chords' => $chords, 'words' => $words],
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
);
