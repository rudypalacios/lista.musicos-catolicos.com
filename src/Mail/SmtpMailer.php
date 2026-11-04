<?php

declare(strict_types=1);

namespace App\Mail;

use App\MailConfig;
use PHPMailer\PHPMailer\Exception as PhpMailerException;
use PHPMailer\PHPMailer\PHPMailer;

/** Sends through the site's own mailbox over SMTP (PHPMailer does the protocol, the encoding and the TLS) */
final class SmtpMailer implements Mailer
{
    public function __construct(private readonly MailConfig $config)
    {
    }

    public function send(string $to, string $subject, string $text): void
    {
        $mail = new PHPMailer(true);
        try {
            $mail->isSMTP();
            $mail->Host = (string) $this->config->host;
            $mail->Port = $this->config->port;
            $mail->SMTPSecure = $this->config->secure;
            // A server with no TLS at all is the local test one: PHPMailer would otherwise upgrade on its own
            $mail->SMTPAutoTLS = $this->config->secure !== '';
            if ($this->config->username !== null) {
                $mail->SMTPAuth = true;
                $mail->Username = $this->config->username;
                $mail->Password = (string) $this->config->password;
            }
            // A mail server that does not answer must not keep the sign-up waiting for minutes
            $mail->Timeout = 10;
            $mail->CharSet = PHPMailer::CHARSET_UTF8;
            $mail->setFrom($this->config->from, $this->config->fromName);
            if ($this->config->replyTo !== null) {
                $mail->addReplyTo($this->config->replyTo);
            }
            $mail->addAddress($to);
            $mail->Subject = $subject;
            $mail->Body = $text;
            $mail->isHTML(false);
            $mail->send();
        } catch (PhpMailerException $e) {
            throw new MailFailed('The message to ' . self::mask($to) . ' was not sent: ' . $e->getMessage(), 0, $e);
        }
    }

    /** The log is not the place for a person's address in full */
    private static function mask(string $email): string
    {
        $at = strrpos($email, '@');

        return $at === false ? '?' : substr($email, 0, 1) . '***' . substr($email, $at);
    }
}
