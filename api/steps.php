<?php
declare(strict_types=1);
require_once __DIR__ . '/db.php';

// GET /api/steps.php?service=nhis-renewal -> the guide plus its ordered steps.
require_method('GET');
$slug = read_slug();
$pdo  = db();

// Query 1: does the guide exist? Gives us a clean 404 for unknown slugs.
$stmt = $pdo->prepare('SELECT id, slug, title, category, summary FROM services WHERE slug = :slug');
$stmt->execute([':slug' => $slug]);
$service = $stmt->fetch();
if (!$service) {
    json_error('Guide not found.', 404);
}

// Query 2: its steps. ORDER BY step_order is served by the
// UNIQUE(service_id, step_order) index, so no extra sorting work.
// The frontend receives a plain ordered array and walks it with an index.
$stmt = $pdo->prepare(
    'SELECT step_order, instruction_text, image_base, image_alt, action_label, action_href
     FROM service_steps
     WHERE service_id = :id
     ORDER BY step_order'
);
$stmt->execute([':id' => $service['id']]);

json_success(['service' => $service, 'steps' => $stmt->fetchAll()]);