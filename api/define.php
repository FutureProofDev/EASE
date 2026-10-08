<?php
declare(strict_types=1);
require_once __DIR__ . '/db.php';

/*
 * POST /api/define.php   body: {"term": "Token"}
 * Lookup order (cheapest and most trustworthy first):
 *   1. local_dictionary      curated by you
 *   2. ai_definition_cache   a previous Gemini answer
 *   3. Gemini API            then saved to the cache
 * The API key lives only in config.php; the browser never sees it.
 */
require_method('POST');

// Read at most 2 KB of body: nobody legitimately sends more than a word.
$raw   = file_get_contents('php://input', false, null, 0, 2048);
$input = json_decode($raw ?: '', true);
$term  = is_array($input) ? trim((string) ($input['term'] ?? '')) : '';

// Strict whitelist: letters, digits, space, dot, hyphen, max 60 chars.
// This also stops anyone using this endpoint as a free "ask Gemini anything"
// relay or injecting instructions into the prompt (no quotes or symbols).
if (!preg_match('/^[\p{L}\p{N} .\-]{1,60}$/u', $term)) {
    json_error('Please send a short word or phrase.', 400);
}

$pdo = db();

// ---- 1. Curated dictionary ----
$stmt = $pdo->prepare('SELECT simple_definition FROM local_dictionary WHERE term = :t LIMIT 1');
$stmt->execute([':t' => $term]);
if ($row = $stmt->fetch()) {
    json_success(['term' => $term, 'definition' => $row['simple_definition'], 'source' => 'dictionary']);
}

// ---- 2. Cache of earlier AI answers ----
$stmt = $pdo->prepare('SELECT definition FROM ai_definition_cache WHERE term = :t LIMIT 1');
$stmt->execute([':t' => $term]);
if ($row = $stmt->fetch()) {
    json_success(['term' => $term, 'definition' => $row['definition'], 'source' => 'cache']);
}

// ---- 3. Ask Gemini (server-side only) ----
$definition = ask_gemini($term, app_config());
if ($definition === null) {
    // 503 = temporarily unavailable. The UI shows a polite fallback message.
    json_error('Sorry, we could not find a simple meaning right now.', 503);
}

// INSERT IGNORE: if two requests race, the second is silently skipped.
$stmt = $pdo->prepare('INSERT IGNORE INTO ai_definition_cache (term, definition) VALUES (:t, :d)');
$stmt->execute([':t' => $term, ':d' => $definition]);

json_success(['term' => $term, 'definition' => $definition, 'source' => 'gemini']);

/**
 * Returns a short plain-language definition, or null on any failure.
 * Failing soft (null) means one outage never breaks the whole app.
 */
function ask_gemini(string $term, array $cfg): ?string
{
    $key = $cfg['gemini_api_key'] ?? '';
    if ($key === '' || str_starts_with($key, 'PASTE')) {
        return null; // Gemini not configured
    }

    $prompt = "Explain \"{$term}\" in one or two very short, simple sentences for an elderly "
            . "person in Ghana who is new to technology. Use plain everyday English. "
            . "No jargon, no markdown, no lists.";

    $url = 'https://generativelanguage.googleapis.com/v1beta/models/'
         . rawurlencode($cfg['gemini_model']) . ':generateContent';

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 4,   // fail fast: a slow API must not freeze the tooltip
        CURLOPT_TIMEOUT        => 8,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'x-goog-api-key: ' . $key,  // key sent in a header, never in the URL or logs
        ],
        CURLOPT_POSTFIELDS     => json_encode([
            'contents'         => [['parts' => [['text' => $prompt]]]],
            'generationConfig' => ['temperature' => 0.2, 'maxOutputTokens' => 300],
        ], JSON_THROW_ON_ERROR),
    ]);
    $body   = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($body === false || $status !== 200) {
        error_log("Gemini request failed (HTTP $status)");
        return null;
    }

    $json = json_decode($body, true);
    $text = $json['candidates'][0]['content']['parts'][0]['text'] ?? null;
    if (!is_string($text) || trim($text) === '') {
        return null;
    }
    // Column is VARCHAR(500): trim safely (mb_ = multibyte-aware).
    return mb_substr(trim($text), 0, 500);
}