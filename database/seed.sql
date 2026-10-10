-- =====================================================================
-- Seed data: 3 Ghanaian service guides.
-- IMPORTANT: Menu wording, USSD codes and prices change. Check every
-- step and number on a real phone / official source before relying on it.
-- Tariff amounts below are PLACEHOLDERS.
-- Note: '#' in a tel: link must be encoded as %23 or the dialer drops it.
-- Image stems (momo-1 etc.) point at files that are not included yet;
-- the app simply hides a step's picture if the file is missing.
-- =====================================================================

SET NAMES utf8mb4;

INSERT INTO services (id, slug, title, category, summary) VALUES
(1, 'momo-registration', 'MTN MoMo Registration', 'Mobile Money',
    'Open your mobile money wallet so you can send and receive money.'),
(2, 'nhis-renewal',      'NHIS Renewal by Phone', 'Health',
    'Renew your National Health Insurance membership with a short code.'),
(3, 'ecg-prepaid',       'Buy ECG Prepaid Credit', 'Utilities',
    'Top up your electricity meter using your Mobile Money wallet.');

-- ---------- Service 1: MoMo Registration ----------
INSERT INTO service_steps
(service_id, step_order, instruction_text, image_base, image_alt, action_label, action_href) VALUES
(1, 1, 'Gather your Ghana Card and the phone with your MTN SIM card. The SIM must be registered in your name.',
    'momo-1', 'A Ghana Card and a mobile phone on a table', NULL, NULL),
(1, 2, 'Visit a MoMo Agent or an MTN service centre near you. Look for the yellow MoMo sign.',
    'momo-2', 'A MoMo agent kiosk with a yellow sign', NULL, NULL),
(1, 3, 'Give the Agent your Ghana Card. The Agent will enter your details and open your wallet.',
    NULL, NULL, NULL, NULL),
(1, 4, 'Dial the MoMo short code on your phone to open your wallet menu.',
    NULL, NULL, 'Dial *170#', 'tel:*170%23'),
(1, 5, 'Follow the prompts to create your secret MoMo PIN. Choose numbers only you will remember. Never share your PIN with anyone.',
    NULL, NULL, NULL, NULL),
(1, 6, 'Wait for the confirmation SMS from MTN. Your wallet is now ready to use.',
    NULL, NULL, NULL, NULL);

-- ---------- Service 2: NHIS Renewal ----------
INSERT INTO service_steps
(service_id, step_order, instruction_text, image_base, image_alt, action_label, action_href) VALUES
(2, 1, 'Find your NHIS membership number. It is printed on your NHIS card.',
    'nhis-1', 'An NHIS membership card with the number highlighted', NULL, NULL),
(2, 2, 'Make sure your MoMo wallet has enough money to pay the premium.',
    NULL, NULL, NULL, NULL),
(2, 3, 'Dial the NHIS short code to open the renewal menu.',
    NULL, NULL, 'Dial *929#', 'tel:*929%23'),
(2, 4, 'Choose the option for renewing your membership, then enter your NHIS membership number when asked.',
    NULL, NULL, NULL, NULL),
(2, 5, 'Confirm the amount shown, then enter your MoMo PIN to pay.',
    NULL, NULL, NULL, NULL),
(2, 6, 'Wait for the confirmation SMS. Keep it as proof of payment until your card is updated.',
    NULL, NULL, NULL, NULL);

-- ---------- Service 3: ECG Prepaid ----------
INSERT INTO service_steps
(service_id, step_order, instruction_text, image_base, image_alt, action_label, action_href) VALUES
(3, 1, 'Find the meter number on the front of your prepaid electricity meter.',
    'ecg-1', 'A prepaid electricity meter with its number visible', NULL, NULL),
(3, 2, 'Dial the MoMo short code to open your wallet menu.',
    NULL, NULL, 'Dial *170#', 'tel:*170%23'),
(3, 3, 'Choose the option to pay a bill, then choose ECG prepaid from the list.',
    NULL, NULL, NULL, NULL),
(3, 4, 'Enter your meter number carefully, then enter the amount you want to buy.',
    NULL, NULL, NULL, NULL),
(3, 5, 'Enter your MoMo PIN to confirm payment.',
    NULL, NULL, NULL, NULL),
(3, 6, 'You will receive an SMS with a token, which is a long number. Type this token into your meter keypad and press the enter key.',
    'ecg-6', 'A hand entering a token on a meter keypad', NULL, NULL);

-- ---------- Tariffs (PLACEHOLDER VALUES - replace with real figures) ----------
INSERT INTO service_tariffs (service_id, item_label, amount_ghs, notes) VALUES
(1, 'Wallet registration',        0.00,  'Placeholder - verify with MTN'),
(1, 'Cash deposit at agent',      0.00,  'Placeholder - verify with MTN'),
(2, 'Renewal premium (example)', 30.00,  'Placeholder - actual premium varies'),
(3, 'Minimum top-up (example)',   5.00,  'Placeholder - verify with ECG'),
(3, 'Typical top-up (example)',  50.00,  'Placeholder - verify with ECG');