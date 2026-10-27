<?php

declare(strict_types=1);

namespace App\Database;

use PDO;

final class Query
{
    /**
     * The first column of the first row (a count, a MAX), or null when there is none.
     *
     * @param list<scalar> $params
     */
    public static function scalar(PDO $pdo, string $sql, array $params = []): mixed
    {
        $statement = $pdo->prepare($sql);
        $statement->execute($params);
        $value = $statement->fetchColumn();

        return $value === false ? null : $value;
    }

    /**
     * The first column of every row.
     *
     * @return list<mixed>
     */
    public static function column(PDO $pdo, string $sql): array
    {
        $statement = $pdo->prepare($sql);
        $statement->execute();

        return $statement->fetchAll(PDO::FETCH_COLUMN);
    }
}
