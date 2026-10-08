<?php
declare(strict_types=1);
// Requires PHP 8.1+ (uses the `never` return type).

/*
 * helpers.php: shared plumbing for every endpoint.
 *
 * Response contract (the frontend's api.js relies on this):
 *   success -> { "ok": true,  "data": ... }
 *   failure -> { "ok": false, "error": "human readable message" }
 * Always JSON, never HTML: this is the decoupling rule.
 */

// A single PHP warning printed into the body would make JSON.parse() fail
// on the client. Log errors to the server log instead of showing them.
ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

/** Send a JSON body and stop. `never` tells PHP this function does not return. */
function send_json(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff'); // stop browsers "guessing" a different type
    // UNESCAPED_UNICODE keeps symbols like GH₵ readable instead of \u20b5.
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

function json_success(mixed $data, int $status = 200): never
{
    send_json($status, ['ok' => true, 'data' => $data]);
}

function json_error(string $message, int $status = 400): never
{
    send_json($status, ['ok' => false, 'error' => $message]);
}

/**
 * Safety net: any uncaught exception (e.g. a PDOException) is logged in
 * full on the server, but the client only sees a generic message, so
 * table names and SQL never leak.
 */
set_exception_handler(function (Throwable $e): void {
    error_log((string) $e);
    json_error('Something went wrong on the server.', 500);
});

/** Load config.php once and reuse it. */
function app_config(): array
{
    static $config = null;
    if ($config === null) {
        $path = __DIR__ . '/config.php';
        if (!is_file($path)) {
            error_log('config.php is missing. Copy config.sample.php to config.php.');
            json_error('Server is not configured.', 500);
        }
        $config = require $path;
    }
    return $config;
}

/** Reject wrong HTTP verbs, e.g. someone POSTing to a read-only endpoint. */
function require_method(string $method): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) {
        header('Allow: ' . $method);
        json_error('Method not allowed.', 405);
    }
}

/**
 * Read and validate ?service=<slug>.
 * Whitelist validation (lowercase letters, digits, hyphens) is a second
 * defence layer on top of prepared statements.
 */
function read_slug(): string
{
    $slug = $_GET['service'] ?? '';
    if (!is_string($slug) || !preg_match('/^[a-z0-9-]{1,60}$/', $slug)) {
        json_error('A valid "service" parameter is required.', 400);
    }
    return $slug;
}