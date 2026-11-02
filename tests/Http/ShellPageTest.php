<?php

declare(strict_types=1);

namespace Tests\Http;

use App\Http\ShellPage;
use PHPUnit\Framework\TestCase;

final class ShellPageTest extends TestCase
{
    private const SHELL = "<!doctype html>\n<html><head>\n    <title>Listas · Músicos Católicos</title>\n"
        . "    <meta name=\"description\" content=\"Listados de cantos para preparar la misa.\">\n"
        . "    <meta name=\"robots\" content=\"noindex, nofollow\">\n</head><body></body></html>";

    public function testTheNameGoesIntoTheTitleAndThePreviewTags(): void
    {
        $page = ShellPage::withPreview(self::SHELL, 'list', 'Misa del domingo');

        $this->assertStringContainsString('<title>Misa del domingo · Músicos Católicos</title>', $page);
        $this->assertStringContainsString('<meta property="og:title" content="Misa del domingo">', $page);
        $this->assertStringContainsString('<meta property="og:description" content="Listado compartido">', $page);
        $this->assertStringContainsString('<meta property="og:site_name" content="Listas · Músicos Católicos">', $page);
        $this->assertStringContainsString('<meta name="description" content="Listado compartido">', $page);
        $this->assertStringNotContainsString('Listados de cantos para preparar la misa', $page);
        // The rest of the page is as it was
        $this->assertStringContainsString('<meta name="robots" content="noindex, nofollow">', $page);
    }

    public function testASongSaysSo(): void
    {
        $page = ShellPage::withPreview(self::SHELL, 'song', 'Pan de vida');

        $this->assertStringContainsString('<meta property="og:description" content="Canto compartido">', $page);
    }

    public function testATitleCannotBreakOutOfTheMarkup(): void
    {
        $page = ShellPage::withPreview(self::SHELL, 'list', '"><script>alert(1)</script> $1 \\0');

        $this->assertStringNotContainsString('<script>', $page);
        $this->assertStringContainsString('&quot;&gt;&lt;script&gt;', $page);
        // Not read as a back-reference by the replacement
        $this->assertStringContainsString('$1 \\0', $page);
    }

    public function testAPageWithoutATitleIsLeftAlone(): void
    {
        $this->assertSame('<html></html>', ShellPage::withPreview('<html></html>', 'list', 'Misa'));
    }
}
