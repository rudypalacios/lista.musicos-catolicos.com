<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Mail\MailFailed;
use App\Mail\Mailer;

/** A mailer for tests: keeps what would have been sent, and can be told to fail */
final class RecordingMailer implements Mailer
{
    /** @var list<array{to: string, subject: string, text: string}> */
    public array $sent = [];
    public bool $failing = false;

    public function send(string $to, string $subject, string $text): void
    {
        if ($this->failing) {
            throw new MailFailed('down');
        }
        $this->sent[] = ['to' => $to, 'subject' => $subject, 'text' => $text];
    }

    /** The code in the last link sent to `$to` (the 64 hex characters after the last slash) */
    public function lastToken(string $to): string
    {
        foreach (array_reverse($this->sent) as $mail) {
            if ($mail['to'] === $to && preg_match('~/([0-9a-f]{64})\s~', $mail['text'], $m) === 1) {
                return $m[1];
            }
        }

        throw new \RuntimeException('No link was sent to ' . $to);
    }
}
