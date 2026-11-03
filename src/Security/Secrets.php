<?php

declare(strict_types=1);

namespace App\Security;

use PDO;
use PDOException;

/** Secrets the app makes for itself the first time it needs one and keeps in its database, so nobody has to set them by hand */
final class Secrets
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** The secret called `name`: 256 random bits as 64 hex characters, made on the first call and the same ever after */
    public function get(string $name): string
    {
        $existing = $this->find($name);
        if ($existing !== null) {
            return $existing;
        }
        try {
            $this->pdo
                ->prepare('INSERT INTO app_secrets (name, secret) VALUES (?, ?)')
                ->execute([$name, bin2hex(random_bytes(32))]);
        } catch (PDOException) {
            // Another request made it between the look and the insert: theirs is the one
        }

        return $this->find($name) ?? throw new \RuntimeException('Could not keep the secret ' . $name);
    }

    private function find(string $name): ?string
    {
        $statement = $this->pdo->prepare('SELECT secret FROM app_secrets WHERE name = ?');
        $statement->execute([$name]);
        $secret = $statement->fetchColumn();

        return is_string($secret) ? $secret : null;
    }
}
