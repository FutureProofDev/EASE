<?php
declare(strict_types=1);
require_once __DIR__ . '/db.php';

// GET /api/dictionary.php -> every curated term, longest first.
require_method('GET');

// Longest first so parser.js can match "Short code" before "code" and
// "Membership number" before "number" without re-sorting in the browser.
$sql = 'SELECT term, simple_definition
        FROM local_dictionary
        ORDER BY CHAR_LENGTH(term) DESC, term';

json_success(db()->query($sql)->fetchAll());