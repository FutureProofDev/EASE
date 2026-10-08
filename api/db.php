<?php
declare(strict_types=1);
require_once __DIR__ . '/helpers.php';

/**
 * db(): returns ONE shared PDO connection per request (lazy singleton).
 * Lazy = the connection is only opened if an endpoint actually needs it.
 */
function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $c   = app_config()['db'];
    // charset in the DSN makes the connection itself utf8mb4.
    $dsn = "mysql:host={$c['host']};dbname={$c['name']};charset={$c['charset']}";

    $pdo = new PDO($dsn, $c['user'], $c['pass'], [
        // Throw exceptions instead of failing silently.
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        // Rows come back as ['column' => value] arrays, ready for json_encode.
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        // false = REAL server-side prepared statements. The SQL and the
        // data travel separately, so input can never be run as SQL.
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
    return $pdo;
}