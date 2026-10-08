-- =====================================================================
-- Senior Accessibility Services Guide - Schema
-- NOTE: No CREATE DATABASE here. On InfinityFree you create the DB in
-- the control panel. Locally, run: CREATE DATABASE senior_guide; first.
-- utf8mb4 is used so Ghanaian text and symbols (e.g. GH₵) store safely.
-- =====================================================================

SET NAMES utf8mb4;

DROP TABLE IF EXISTS ai_definition_cache;
DROP TABLE IF EXISTS local_dictionary;
DROP TABLE IF EXISTS service_tariffs;
DROP TABLE IF EXISTS service_steps;
DROP TABLE IF EXISTS services;

-- Parent table: one row per guide (e.g. "NHIS Renewal").
-- slug gives readable, stable identifiers for the frontend.
CREATE TABLE services (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    slug        VARCHAR(60)  NOT NULL UNIQUE,
    title       VARCHAR(120) NOT NULL,
    category    VARCHAR(50)  NOT NULL,
    summary     VARCHAR(255) NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Child table: ordered steps of a guide.
-- UNIQUE(service_id, step_order) guarantees no duplicate step numbers and
-- creates an index, so "WHERE service_id = ? ORDER BY step_order" is
-- served from the index with no extra sort.
-- ON DELETE CASCADE removes steps automatically when a service is deleted
-- (prevents orphan rows = referential integrity).
-- action_label/action_href hold optional native links, e.g. tel:*929%23.
-- image_base is a filename stem; the frontend builds <picture>/srcset
-- variants from it (e.g. nhis-1-480.webp, nhis-1-960.webp).
CREATE TABLE service_steps (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    service_id       INT UNSIGNED NOT NULL,
    step_order       TINYINT UNSIGNED NOT NULL,
    instruction_text TEXT NOT NULL,
    image_base       VARCHAR(80)  NULL,
    image_alt        VARCHAR(160) NULL,
    action_label     VARCHAR(60)  NULL,
    action_href      VARCHAR(120) NULL,
    CONSTRAINT fk_steps_service
        FOREIGN KEY (service_id) REFERENCES services(id)
        ON DELETE CASCADE,
    CONSTRAINT uq_service_order UNIQUE (service_id, step_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Data for the <table> requirement.
CREATE TABLE service_tariffs (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    service_id  INT UNSIGNED NOT NULL,
    item_label  VARCHAR(120) NOT NULL,
    amount_ghs  DECIMAL(8,2) NOT NULL,   -- DECIMAL, never FLOAT, for money
    notes       VARCHAR(160) NULL,
    CONSTRAINT fk_tariffs_service
        FOREIGN KEY (service_id) REFERENCES services(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Curated plain-language definitions. UNIQUE term = fast exact lookup
-- and prevents duplicates. Collation is case-insensitive by default.
CREATE TABLE local_dictionary (
    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    term              VARCHAR(60)  NOT NULL UNIQUE,
    simple_definition VARCHAR(300) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cache of Gemini answers. term is the primary key, so repeat lookups
-- never hit the external API twice.
CREATE TABLE ai_definition_cache (
    term        VARCHAR(60)  NOT NULL PRIMARY KEY,
    definition  VARCHAR(500) NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;