<?php
// TEMPLATE. Copy this file to config.php and fill in real values.
// config.php is git-ignored; this sample is safe to commit.
return [
    'db' => [
        'host'    => '127.0.0.1',
        'name'    => 'senior_guide',
        'user'    => 'root',
        'pass'    => '',
        'charset' => 'utf8mb4',
    ],
    // Get a key from Google AI Studio. Leave the placeholder to disable Gemini
    // (define.php then simply falls back to dictionary/cache only).
    'gemini_api_key' => 'PASTE_YOUR_KEY_HERE',
    // Model names change over time: check the current name in Google's docs.
    'gemini_model'   => 'gemini-2.5-flash',
];