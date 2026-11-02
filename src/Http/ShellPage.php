<?php

declare(strict_types=1);

namespace App\Http;

/**
 * The app's one HTML page, with the name of what a link opens put into the places a chat app reads when a link is
 * pasted (the title and the Open Graph tags). Everything else about the page is as it was built.
 */
final class ShellPage
{
    private const SITE = 'Músicos Católicos';

    /**
     * @param 'list'|'song' $kind
     *
     * @return string the page with the title and the preview tags; the page itself when it has no `<title>` to replace
     */
    public static function withPreview(string $html, string $kind, string $name): string
    {
        $title = self::escape($name . ' · ' . self::SITE);
        $shown = self::escape($name);
        $about = $kind === 'song' ? 'Canto compartido' : 'Listado compartido';
        $site = self::escape('Listas · ' . self::SITE);
        $tags = '<meta property="og:type" content="website">' . "\n"
            . '    <meta property="og:site_name" content="' . $site . '">' . "\n"
            . '    <meta property="og:title" content="' . $shown . '">' . "\n"
            . '    <meta property="og:description" content="' . $about . '">';

        $replaced = preg_replace_callback(
            '~<title>.*?</title>~s',
            static fn (): string => '<title>' . $title . '</title>',
            $html,
            1,
            $count
        );
        if ($replaced === null || $count === 0) {
            return $html;
        }
        // The description a search or chat app falls back to says what the link is, not what the app is for
        $replaced = preg_replace_callback(
            '~<meta name="description" content="[^"]*">~',
            static fn (): string => '<meta name="description" content="' . $about . '">' . "\n    " . $tags,
            $replaced,
            1
        );

        return $replaced ?? $html;
    }

    private static function escape(string $text): string
    {
        return htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
