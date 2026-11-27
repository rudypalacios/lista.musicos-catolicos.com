<?php

declare(strict_types=1);

namespace App\Auth\Google;

use App\Auth\Authenticator;
use App\Auth\EmailTokens;
use App\Database\Query;
use App\Uuid;
use PDO;
use PDOException;

/**
 * Which account a Google sign-in is, and what to do when it is not one yet.
 *
 * 1. Google's id for the person is already linked: that account.
 * 2. Not linked, but an account with that address exists and its address was confirmed: the person is who the address says
 *    (Google confirmed it too), so the identity is linked to that account and they find their songs.
 * 3. Not linked, and the account with that address was never confirmed: someone typed an address with a password and nobody
 *    proved it was theirs. Google proves it, so the account is the Google person's: its password and its sessions are
 *    dropped. Otherwise whoever had signed up with a stranger's address would get the stranger's data the day the stranger
 *    signed in with Google.
 * 4. No account: one is made, already confirmed, with no password anyone knows.
 */
final class GoogleAccounts
{
    public const PROVIDER = 'google';

    public function __construct(
        private readonly PDO $pdo,
        private readonly Authenticator $authenticator,
        private readonly EmailTokens $tokens,
    ) {
    }

    /**
     * Finds or makes the account and opens its session.
     *
     * @return array{userId: string, email: string, sessionToken: string, created: bool}
     */
    public function signIn(GoogleIdentity $who, int $now): array
    {
        try {
            return $this->attempt($who, $now);
        } catch (PDOException) {
            // The same person's second request got there first (the same address, or the same Google id): look again
            return $this->attempt($who, $now);
        }
    }

    /**
     * @return array{userId: string, email: string, sessionToken: string, created: bool}
     */
    private function attempt(GoogleIdentity $who, int $now): array
    {
        $created = false;
        $userId = $this->linkedUser($who->subject);
        if ($userId === null) {
            $this->pdo->beginTransaction();
            try {
                [$userId, $created] = $this->takeOver($who, $now);
                $this->link($who->subject, $userId, $now);
                $this->pdo->commit();
            } catch (PDOException $e) {
                $this->pdo->rollBack();
                throw $e;
            }
        }
        $email = Query::scalar($this->pdo, 'SELECT email FROM users WHERE id = ?', [$userId]);

        return [
            'userId' => $userId,
            'email' => is_string($email) ? $email : $who->email,
            'sessionToken' => $this->authenticator->startSession($userId),
            'created' => $created,
        ];
    }

    private function linkedUser(string $subject): ?string
    {
        $id = Query::scalar(
            $this->pdo,
            'SELECT user_id FROM identities WHERE provider = ? AND subject = ?',
            [self::PROVIDER, $subject]
        );

        return is_string($id) ? $id : null;
    }

    /**
     * The account of the address (made, or claimed if nobody confirmed it), and whether it was made now.
     *
     * @return array{0: string, 1: bool}
     */
    private function takeOver(GoogleIdentity $who, int $now): array
    {
        $statement = $this->pdo->prepare('SELECT id, email_verified_at FROM users WHERE email = ?');
        $statement->execute([$who->email]);
        $row = $statement->fetch();

        if (!is_array($row)) {
            $id = Uuid::v4();
            $this->pdo
                ->prepare(
                    'INSERT INTO users (id, email, password_hash, created_at, email_verified_at) VALUES (?, ?, ?, ?, ?)'
                )
                ->execute([$id, $who->email, self::unusablePasswordHash(), gmdate('Y-m-d H:i:s'), $now]);

            return [$id, true];
        }

        $id = (string) $row['id'];
        if ($row['email_verified_at'] === null) {
            $this->pdo
                ->prepare('UPDATE users SET password_hash = ?, email_verified_at = ? WHERE id = ?')
                ->execute([self::unusablePasswordHash(), $now, $id]);
            $this->authenticator->endAllSessions($id);
            $this->tokens->cancelAll($id);
        }

        return [$id, false];
    }

    private function link(string $subject, string $userId, int $now): void
    {
        $this->pdo
            ->prepare('INSERT INTO identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)')
            ->execute([self::PROVIDER, $subject, $userId, $now]);
    }

    /**
     * A password nobody knows, for an account that signs in with Google (the column cannot be empty). The person can still
     * choose one with "Olvidé mi contraseña", which is how they would sign in with the password too.
     */
    private static function unusablePasswordHash(): string
    {
        return password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT);
    }
}
