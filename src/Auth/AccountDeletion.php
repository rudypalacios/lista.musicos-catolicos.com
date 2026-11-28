<?php

declare(strict_types=1);

namespace App\Auth;

use App\Database\Query;
use App\Mail\AccountMail;
use App\Mail\MailFailed;
use PDO;
use Throwable;

/**
 * Deleting an account, in three steps made so nobody does it without meaning to (the owner's decision, 2026-11-28):
 *
 * 1. The person asks, in the app: a link is sent to the account's email (it lives 1 hour). Nothing changes yet.
 * 2. They open the link and say yes. The account is then kept 3 days, hidden and locked: every session ends, its shared links
 *    stop working and nothing can be sent or read. Signing in again offers to keep it (`keep`).
 * 3. After the 3 days it is deleted for good (`purgeDue`, run whenever somebody uses the app: the host has no cron).
 */
final class AccountDeletion
{
    public const GRACE_DAYS = 3;
    public const LINK_TTL_SECONDS = 3600;
    /** The Mass, which every account has from the start (`MISA_ID` in `web/src/data/templates.ts`): it is not something the person made */
    public const DEFAULT_TEMPLATE = '00000000-0000-4000-8000-00000000a115';

    /** Everything a person owns, by the table that holds it (all keyed by `user_id`) */
    private const OWNED = [
        'sessions', 'email_tokens', 'identities', 'shares', 'song_shares', 'songs', 'setlists', 'templates', 'sync_state',
    ];

    public function __construct(
        private readonly PDO $pdo,
        private readonly Authenticator $authenticator,
        private readonly EmailTokens $tokens,
        private readonly AccountMail $mail,
    ) {
    }

    /** Step 1: sends the link that asks the person to confirm; false if the mail server failed (nothing was started) */
    public function request(User $user, int $now): bool
    {
        $token = $this->tokens->issue($user->id, EmailTokens::DELETE, self::LINK_TTL_SECONDS, $now);
        try {
            $this->mail->sendAccountDeletion($user->email, $token);
        } catch (MailFailed $e) {
            error_log($e->getMessage());

            return false;
        }

        return true;
    }

    /**
     * What the page of the link says before the person answers, without spending the code.
     *
     * @return array{email: string, songs: int, lists: int, templates: int}|null null when the link does not work
     */
    public function preview(string $token, int $now): ?array
    {
        $userId = $this->tokens->peek($token, EmailTokens::DELETE, $now);
        if ($userId === null) {
            return null;
        }
        $email = Query::scalar($this->pdo, 'SELECT email FROM users WHERE id = ?', [$userId]);
        if (!is_string($email)) {
            return null;
        }
        $count = fn (string $table, string $not = ''): int => (int) Query::scalar(
            $this->pdo,
            'SELECT COUNT(*) FROM ' . $table . ' WHERE user_id = ? AND deleted_at IS NULL' . ($not === '' ? '' : ' AND id <> ?'),
            $not === '' ? [$userId] : [$userId, $not]
        );

        return [
            'email' => $email,
            'songs' => $count('songs'),
            'lists' => $count('setlists'),
            'templates' => $count('templates', self::DEFAULT_TEMPLATE),
        ];
    }

    /**
     * Step 2: the person said yes. The account is locked for 3 days: its sessions end and its codes are cancelled. Saying yes twice
     * does not move the day.
     *
     * @return array{email: string, deleteAfter: int}|null null when the link does not work (wrong, used or expired)
     */
    public function confirm(string $token, int $now): ?array
    {
        $userId = $this->tokens->consume($token, EmailTokens::DELETE, $now);
        if ($userId === null) {
            return null;
        }
        $this->pdo
            ->prepare('UPDATE users SET delete_after = COALESCE(delete_after, ?) WHERE id = ?')
            ->execute([$now + self::GRACE_DAYS * 86400 * 1000, $userId]);
        $this->authenticator->endAllSessions($userId);
        $this->tokens->cancelAll($userId);

        $row = $this->pdo->prepare('SELECT email, delete_after FROM users WHERE id = ?');
        $row->execute([$userId]);
        $user = $row->fetch();

        return is_array($user) ? ['email' => (string) $user['email'], 'deleteAfter' => (int) $user['delete_after']] : null;
    }

    /** The person changed their mind: the account is as it was, shared links included */
    public function keep(string $userId): void
    {
        $this->pdo->prepare('UPDATE users SET delete_after = NULL WHERE id = ?')->execute([$userId]);
    }

    /**
     * Step 3: deletes, for good, the accounts whose 3 days have passed, with everything they own.
     *
     * @return int how many accounts were deleted
     */
    public function purgeDue(int $now): int
    {
        $due = $this->pdo->prepare('SELECT id FROM users WHERE delete_after IS NOT NULL AND delete_after <= ?');
        $due->execute([$now]);
        $ids = $due->fetchAll(PDO::FETCH_COLUMN);

        $deleted = 0;
        foreach ($ids as $id) {
            $this->pdo->beginTransaction();
            try {
                foreach (self::OWNED as $table) {
                    $this->pdo->prepare('DELETE FROM ' . $table . ' WHERE user_id = ?')->execute([$id]);
                }
                $this->pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
                $this->pdo->commit();
                $deleted++;
            } catch (Throwable $e) {
                $this->pdo->rollBack();
                throw $e;
            }
        }

        return $deleted;
    }
}
