<?php

declare(strict_types=1);

namespace Tests\Auth\Google;

use App\Auth\Accounts;
use App\Auth\Authenticator;
use App\Auth\EmailTokens;
use App\Auth\Google\GoogleAccounts;
use App\Auth\Google\GoogleIdentity;
use App\Database\Query;
use App\Mail\AccountMail;
use PDO;
use PHPUnit\Framework\TestCase;
use Tests\Support\RecordingMailer;
use Tests\Support\TestDatabase;

/** The rules that decide which account a Google sign-in is (the order of the cases is the class's own) */
final class GoogleAccountsTest extends TestCase
{
    private const NOW = 1_800_000_000_000;

    private PDO $pdo;
    private Authenticator $authenticator;
    private EmailTokens $tokens;
    private GoogleAccounts $google;

    protected function setUp(): void
    {
        $this->pdo = TestDatabase::migrated();
        $this->authenticator = new Authenticator($this->pdo);
        $this->tokens = new EmailTokens($this->pdo);
        $this->google = new GoogleAccounts($this->pdo, $this->authenticator, $this->tokens);
    }

    private function rows(string $table): int
    {
        return (int) Query::scalar($this->pdo, 'SELECT COUNT(*) FROM ' . $table);
    }

    public function testAPersonWithNoAccountGetsOneAlreadyConfirmed(): void
    {
        $result = $this->google->signIn(new GoogleIdentity('sub-1', 'ana@gmail.com'), self::NOW);

        $this->assertTrue($result['created']);
        $this->assertSame('ana@gmail.com', $result['email']);
        $user = $this->authenticator->authenticate($result['sessionToken']);
        $this->assertNotNull($user);
        $this->assertSame($result['userId'], $user->id);
        $this->assertTrue($user->verified, 'Google proved the address: no link to send');
    }

    public function testTheAccountThatGoogleMakesHasNoPasswordAnyoneKnows(): void
    {
        $this->google->signIn(new GoogleIdentity('sub-1', 'ana@gmail.com'), self::NOW);

        foreach (['ana@gmail.com', 'password', 'una clave bien larga'] as $guess) {
            $this->assertNull($this->authenticator->login('ana@gmail.com', $guess, '1.1.1.1'));
        }
    }

    public function testTheSecondTimeItIsTheSameAccountAndNoneIsMade(): void
    {
        $first = $this->google->signIn(new GoogleIdentity('sub-1', 'ana@gmail.com'), self::NOW);
        $second = $this->google->signIn(new GoogleIdentity('sub-1', 'ana@gmail.com'), self::NOW + 1);

        $this->assertFalse($second['created']);
        $this->assertSame($first['userId'], $second['userId']);
        $this->assertSame(1, $this->rows('users'));
        $this->assertSame(1, $this->rows('identities'));
    }

    public function testGoogleIdFollowsThePersonWhenTheirAddressChanges(): void
    {
        $first = $this->google->signIn(new GoogleIdentity('sub-1', 'ana@gmail.com'), self::NOW);
        $later = $this->google->signIn(new GoogleIdentity('sub-1', 'ana.nueva@gmail.com'), self::NOW + 1);

        $this->assertSame($first['userId'], $later['userId']);
        $this->assertSame('ana@gmail.com', $later['email'], 'the address of the account is not rewritten by a sign-in');
    }

    public function testAConfirmedAccountWithThatAddressIsJoinedAndKeepsItsPassword(): void
    {
        (new Authenticator($this->pdo))->seedOwner('owner@gmail.com', 'correct horse', null);

        $result = $this->google->signIn(new GoogleIdentity('sub-9', 'owner@gmail.com'), self::NOW);

        $this->assertFalse($result['created']);
        $this->assertSame(1, $this->rows('users'), 'no second account');
        $this->assertNotNull($this->authenticator->login('owner@gmail.com', 'correct horse', '1.1.1.1'), 'the password still works');
    }

    private function registerUnconfirmed(string $email, string $password): string
    {
        $accounts = new Accounts($this->pdo, $this->authenticator, $this->tokens, new AccountMail(new RecordingMailer(), 'https://x.test'));

        return $accounts->register($email, $password, self::NOW)['userId'];
    }

    public function testAnAccountNobodyConfirmedBecomesTheGooglePersonsAndLosesItsPassword(): void
    {
        $squatter = $this->registerUnconfirmed('ana@gmail.com', 'la clave del intruso');
        $this->authenticator->startSession($squatter);
        $this->tokens->issue($squatter, EmailTokens::RESET, 3600, self::NOW);

        $result = $this->google->signIn(new GoogleIdentity('sub-1', 'ana@gmail.com'), self::NOW + 1);

        $this->assertSame($squatter, $result['userId'], 'the records stay with the address');
        $this->assertNull($this->authenticator->login('ana@gmail.com', 'la clave del intruso', '1.1.1.1'), 'its password is gone');
        $this->assertSame(1, $this->rows('sessions'), 'every older session ended: only the one just opened is left');
        $this->assertSame(0, $this->rows('email_tokens'), 'the links already sent are cancelled');
        $user = $this->authenticator->authenticate($result['sessionToken']);
        $this->assertNotNull($user);
        $this->assertTrue($user->verified);
    }

    public function testTwoGoogleAccountsNeverShareAUser(): void
    {
        $a = $this->google->signIn(new GoogleIdentity('sub-1', 'ana@gmail.com'), self::NOW);
        $b = $this->google->signIn(new GoogleIdentity('sub-2', 'beto@gmail.com'), self::NOW);

        $this->assertNotSame($a['userId'], $b['userId']);
        $this->assertSame(2, $this->rows('identities'));
    }

    public function testAnotherGoogleIdForAnAddressThatIsTakenJoinsTheSameAccount(): void
    {
        // Google can give one address another id (the account was deleted and made again): the address is the proof
        $first = $this->google->signIn(new GoogleIdentity('sub-1', 'ana@gmail.com'), self::NOW);
        $again = $this->google->signIn(new GoogleIdentity('sub-2', 'ana@gmail.com'), self::NOW + 1);

        $this->assertSame($first['userId'], $again['userId']);
        $this->assertSame(2, $this->rows('identities'));
    }
}
