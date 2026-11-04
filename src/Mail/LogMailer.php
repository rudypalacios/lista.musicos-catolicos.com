<?php

declare(strict_types=1);

namespace App\Mail;

/**
 * What stands in for the mail server when the app has none set (see `MailConfig`): the message goes to the error
 * log, whole, so on a developer's machine the link can be copied from there. In production that means the .env
 * still lacks the mailbox, and the log says so.
 */
final class LogMailer implements Mailer
{
    public function send(string $to, string $subject, string $text): void
    {
        $why = 'no MAIL_HOST, or MAIL_DRIVER is not smtp';
        error_log("Mail not sent ({$why}): to {$to}, subject \"{$subject}\"\n{$text}");
    }
}
