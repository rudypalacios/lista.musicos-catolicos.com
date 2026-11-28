<?php

declare(strict_types=1);

namespace App\Mail;

/**
 * The messages an account sends: confirm the address, choose a new password, and confirm that the account is to be deleted. The links point at the
 * site's own address from the configuration, never at the host the request came with: a request can name any
 * host, and a reset link that went to one would hand the code to whoever asked.
 */
final class AccountMail
{
    public function __construct(private readonly Mailer $mailer, private readonly string $appUrl)
    {
    }

    /** @throws MailFailed */
    public function sendVerification(string $to, string $token): void
    {
        $this->mailer->send(
            $to,
            'Confirma tu correo en Listas',
            "Hola:\n\n"
            . "Para confirmar que este correo es tuyo, abre este enlace:\n\n"
            . "{$this->appUrl}/verificar/{$token}\n\n"
            . "El enlace sirve una vez y vence en 2 días. Si no creaste una cuenta en Listas, ignora este mensaje: "
            . "no pasa nada.\n\n"
            . "Músicos Católicos\n"
        );
    }

    /** @throws MailFailed */
    public function sendAccountDeletion(string $to, string $token): void
    {
        $this->mailer->send(
            $to,
            'Confirma que quieres eliminar tu cuenta de Listas',
            "Hola:\n\n"
            . "Pediste eliminar tu cuenta de Listas.\n\n"
            . "Si fuiste tú, abre este enlace y confirma:\n\n"
            . "{$this->appUrl}/eliminar/{$token}\n\n"
            . "Tu cuenta se guardará 3 días por si cambias de opinión (si entras otra vez en ese tiempo, puedes conservarla) "
            . "y después se borrará para siempre.\n\n"
            . "El enlace sirve una vez y vence en 1 hora. Si no fuiste tú, ignora este mensaje: no pasa nada.\n\n"
            . "Músicos Católicos\n"
        );
    }

    /** @throws MailFailed */
    public function sendPasswordReset(string $to, string $token): void
    {
        $this->mailer->send(
            $to,
            'Elige una contraseña nueva en Listas',
            "Hola:\n\n"
            . "Pediste elegir una contraseña nueva para tu cuenta de Listas. Abre este enlace:\n\n"
            . "{$this->appUrl}/restablecer/{$token}\n\n"
            . "El enlace sirve una vez y vence en 1 hora. Si no lo pediste tú, ignora este mensaje: "
            . "tu contraseña no cambia hasta que alguien abra el enlace.\n\n"
            . "Músicos Católicos\n"
        );
    }
}
