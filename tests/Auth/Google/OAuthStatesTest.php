<?php

declare(strict_types=1);

namespace Tests\Auth\Google;

use App\Auth\Google\OAuthStates;
use App\Database\Query;
use PDO;
use PHPUnit\Framework\TestCase;
use Tests\Support\TestDatabase;

final class OAuthStatesTest extends TestCase
{
    private const NOW = 1_800_000_000_000;

    private PDO $pdo;
    private OAuthStates $states;

    protected function setUp(): void
    {
        $this->pdo = TestDatabase::migrated();
        $this->states = new OAuthStates($this->pdo);
    }

    public function testASignInComesBackOnceWithItsOwnBrowser(): void
    {
        $started = $this->states->issue(self::NOW);

        $back = $this->states->consume($started['state'], $started['binding'], self::NOW + 1000);

        $this->assertSame(['verifier' => $started['verifier'], 'nonce' => $started['nonce']], $back);
        $this->assertNull($this->states->consume($started['state'], $started['binding'], self::NOW + 2000), 'it works once');
    }

    public function testAnotherBrowserCannotFinishIt(): void
    {
        $started = $this->states->issue(self::NOW);

        $this->assertNull($this->states->consume($started['state'], str_repeat('0', 64), self::NOW + 1000));
        $this->assertNull(
            $this->states->consume($started['state'], $started['binding'], self::NOW + 2000),
            'a wrong try spends it: the person starts again'
        );
    }

    public function testItExpiresAfterTenMinutes(): void
    {
        $started = $this->states->issue(self::NOW);

        $this->assertNull(
            $this->states->consume($started['state'], $started['binding'], self::NOW + OAuthStates::TTL_SECONDS * 1000)
        );
    }

    public function testWhatIsNotAStateIsRefusedWithoutLookingForIt(): void
    {
        $this->assertNull($this->states->consume("' OR 1=1 --", 'x', self::NOW));
        $this->assertNull($this->states->consume('', '', self::NOW));
    }

    public function testOnlyHashesAreKept(): void
    {
        $started = $this->states->issue(self::NOW);

        $row = $this->pdo->query('SELECT * FROM oauth_states')->fetch();
        $this->assertSame(hash('sha256', $started['state']), $row['state_hash']);
        $this->assertSame(hash('sha256', $started['binding']), $row['binding_hash']);
        $this->assertStringNotContainsString($started['state'], (string) json_encode($row));
        $this->assertStringNotContainsString($started['binding'], (string) json_encode($row));
    }

    public function testExpiredOnesAreDeletedWhenTheNextStarts(): void
    {
        $this->states->issue(self::NOW);
        $this->states->issue(self::NOW + 2 * OAuthStates::TTL_SECONDS * 1000);

        $this->assertSame(1, (int) Query::scalar($this->pdo, 'SELECT COUNT(*) FROM oauth_states'));
    }

    public function testThePkceVerifierHasTheLengthTheStandardAsks(): void
    {
        $started = $this->states->issue(self::NOW);

        $this->assertMatchesRegularExpression('/^[A-Za-z0-9_-]{43,128}$/', $started['verifier']);
    }
}
