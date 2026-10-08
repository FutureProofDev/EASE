<?php
declare(strict_types=1);
require_once __DIR__ . '/db.php';

// GET /api/tariffs.php                    -> all tariff rows
// GET /api/tariffs.php?service=ecg-prepaid -> rows for one guide
require_method('GET');

$sql = 'SELECT s.slug AS service_slug, t.item_label, t.amount_ghs, t.notes
        FROM service_tariffs t
        JOIN services s ON s.id = t.service_id';
$params = [];

if (isset($_GET['service'])) {
    $sql .= ' WHERE s.slug = :slug';
    $params[':slug'] = read_slug();
}
$sql .= ' ORDER BY t.id';

$stmt = db()->prepare($sql);
$stmt->execute($params);

// amount_ghs stays a STRING like "30.00" (DECIMAL). Converting to a JS-style
// float could turn money into 29.999999..., so the frontend only formats it.
json_success($stmt->fetchAll());