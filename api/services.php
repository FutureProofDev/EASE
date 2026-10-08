<?php
declare(strict_types=1);
require_once __DIR__ . '/db.php';

// GET /api/services.php  ->  list of guides for the Home cards.
require_method('GET');

// LEFT JOIN + COUNT gives each card a "6 steps" label in one query.
// LEFT (not INNER) so a guide with zero steps still appears.
$sql = 'SELECT s.id, s.slug, s.title, s.category, s.summary,
               COUNT(st.id) AS step_count
        FROM services s
        LEFT JOIN service_steps st ON st.service_id = s.id
        GROUP BY s.id
        ORDER BY s.id';

// No user input here, so query() is safe; endpoints with input use prepare().
json_success(db()->query($sql)->fetchAll());