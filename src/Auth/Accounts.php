<?php

declare(strict_types=1);

namespace App\Auth;

use App\Database\Query;
use App\Mail\AccountMail;
use App\Mail\MailFailed;
use App\Uuid;
use PDO;
use PDOException;

/**
 * Accounts of other people: signing up, proving the email is theirs, and choosing a new password by a link sent to it.
 *
 * The email is the person's name in the app; it is lowercased and has to look like an address. A password is at least
 * 10 characters and at most 72 bytes (what bcrypt reads; longer would be cut without telling). Nothing else is asked
 * of it: length is what makes a password hard to guess, not a rule about symbols.
 */
final class Accounts
{
    public const PASSWORD_MIN = 10;
    public const PASSWORD_MAX_BYTES = 72;
    /** The link to confirm the address lives this long, and the one to choose a new password this long */
    private const VERIFY_TTL_SECONDS = 2 * 86400;
    private const RESET_TTL_SECONDS = 3600;

    public function __construct(
        private readonly PDO $pdo,
        private readonly Authenticator $authenticator,
        private readonly EmailTokens $tokens,
        private readonly AccountMail $mail,
    ) {
    }

    /**
     * The email as it is kept (trimmed, lowercase).
     *
     * @throws InvalidAccount when it is not an address
     */
    public static function cleanEmail(string $email): string
    {
        $clean = strtolower(trim($email));
        if ($clean === '' || strlen($clean) > 190 || filter_var($clean, FILTER_VALIDATE_EMAIL) === false) {
            throw new InvalidAccount('Escribe un correo válido.', 'email');
        }

        return $clean;
    }

    /** @throws InvalidAccount when the password is too short or too long */
    public static function checkPassword(string $password): void
    {
        if (mb_strlen($password) < self::PASSWORD_MIN) {
            $message = 'La contraseña necesita al menos ' . self::PASSWORD_MIN . ' caracteres.';
            throw new InvalidAccount($message, 'password');
        }
        if (strlen($password) > self::PASSWORD_MAX_BYTES) {
            throw new InvalidAccount('La contraseña es demasiado larga: usa menos de 72 caracteres.', 'password');
        }
    }

    /**
       * Makes the account and opens its session. The person can use the app at once; the link that confirms the
       * address is sent after, and if the mail server fails the account exists anyway (`mailSent` says so, and it
       * can be sent again).
     *
     * @return array{userId: string, email: string, sessionToken: string, mailSent: bool}
     *
     * @throws InvalidAccount
     * @throws EmailTaken
     */
    public function register(string $email, string $password, int $now): array
    {
        $clean = self::cleanEmail($email);
        self::checkPassword($password);
        if ($this->idOf($clean) !== null) {
            throw new EmailTaken();
        }

        $id = Uuid::v4();
        try {
            $this->pdo
                ->prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
                ->execute([$id, $clean, password_hash($password, PASSWORD_DEFAULT), gmdate('Y-m-d H:i:s')]);
        } catch (PDOException $e) {
            // Two requests with the same address at once: the other one got there first
            if ($this->hasAccount($clean)) {
                throw new EmailTaken();
            }
            throw $e;
        }

        return [
            'userId' => $id,
            'email' => $clean,
            'sessionToken' => $this->authenticator->startSession($id),
            'mailSent' => $this->sendVerification($id, $clean, $now),
        ];
    }

    /** Sends the link that confirms the address (again, if it was sent before); false if the mail server failed */
    public function sendVerification(string $userId, string $email, int $now): bool
    {
        $token = $this->tokens->issue($userId, EmailTokens::VERIFY, self::VERIFY_TTL_SECONDS, $now);
        try {
            $this->mail->sendVerification($email, $token);
        } catch (MailFailed $e) {
            error_log($e->getMessage());

            return false;
        }

        return true;
    }

    /** Opens the link of the confirmation: the account's email, or null when the link does not work */
    public function verify(string $token, int $now): ?string
    {
        $userId = $this->tokens->consume($token, EmailTokens::VERIFY, $now);
        if ($userId === null) {
            return null;
        }
        $this->pdo
            ->prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?')
            ->execute([$now, $userId]);

        return $this->emailOf($userId);
    }

    /**
     * Sends the link to choose a new password, if there is an account with this email. It says nothing about whether
     * there is: the answer of the app is the same either way, so the form cannot be used to find who has an account.
     */
    public function requestReset(string $email, int $now): void
    {
        $clean = strtolower(trim($email));
        $id = $this->idOf($clean);
        if ($id === null) {
            return;
        }
        $token = $this->tokens->issue($id, EmailTokens::RESET, self::RESET_TTL_SECONDS, $now);
        try {
            $this->mail->sendPasswordReset($clean, $token);
        } catch (MailFailed $e) {
            error_log($e->getMessage());
        }
    }

    /**
      * Chooses the new password with the code of the link. Every session ends (whoever knew the old password, or
      * had a session open, is out) and the address counts as confirmed: the link reached it. The password is
      * checked before the code is spent, so a short one does not burn the link.
     *
     * @return string|null the account's email, or null when the link does not work
     *
     * @throws InvalidAccount
     */
    public function resetPassword(string $token, string $password, int $now): ?string
    {
        self::checkPassword($password);
        $userId = $this->tokens->consume($token, EmailTokens::RESET, $now);
        if ($userId === null) {
            return null;
        }
        $this->pdo
            ->prepare(
                'UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?'
            )
            ->execute([password_hash($password, PASSWORD_DEFAULT), $now, $userId]);
        $this->authenticator->endAllSessions($userId);
        $this->tokens->cancelAll($userId);

        return $this->emailOf($userId);
    }

    private function idOf(string $email): ?string
    {
        $id = Query::scalar($this->pdo, 'SELECT id FROM users WHERE email = ?', [$email]);

        return is_string($id) ? $id : null;
    }

    private function hasAccount(string $email): bool
    {
        return $this->idOf($email) !== null;
    }

    private function emailOf(string $userId): ?string
    {
        $email = Query::scalar($this->pdo, 'SELECT email FROM users WHERE id = ?', [$userId]);

        return is_string($email) ? $email : null;
    }
}
