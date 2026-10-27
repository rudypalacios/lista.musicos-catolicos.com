<?php

declare(strict_types=1);

namespace App\Database;

use App\Config;
use PDO;

final class Connection
{
    /**
     * Errors throw (fail fast), rows come back as associative arrays, and the database does
     * its own prepared statements (no emulation), so values are never spliced into SQL.
     */
    public static function create(Config $config): PDO
    {
        return new PDO($config->dbDsn, $config->dbUsername, $config->dbPassword, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
}
