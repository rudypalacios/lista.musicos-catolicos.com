<?php

declare(strict_types=1);

namespace App\Mail;

/** Sends one plain-text email. What it says is `AccountMail`'s; how it travels is each implementation's. */
interface Mailer
{
    /** @throws MailFailed when the message could not be handed to the mail server */
    public function send(string $to, string $subject, string $text): void;
}
