-- Company root alias: `/company` now renders `company.ceo`'s content (no
-- redirect), so any `page_content` override keyed under `company#…` must move to
-- `company.ceo#…` or it would become a silent no-op.
--
-- Collision policy: on a KO/EN pair where both the alias key and the target key
-- exist, the target (`company.ceo`) wins — delete the alias row, then rewrite
-- the remaining alias rows.
--
-- Deploy ordering: apply this AFTER the code that regenerates the registry
-- without the `company` defs and BEFORE/with the release that ships the
-- `/company` alias read path. It is idempotent-safe to run once; do not apply to
-- the remote database from CI without the same ordering.

-- Target wins on collision: drop alias rows that duplicate a `company.ceo` row.
DELETE FROM page_content p
WHERE p.key LIKE 'company#%'
  AND EXISTS (SELECT 1 FROM page_content q
              WHERE q.locale = p.locale
                AND q.key = 'company.ceo#' || substr(p.key, length('company#') + 1));

-- Rewrite the surviving alias overrides onto the target pageKey.
UPDATE page_content
SET key = 'company.ceo#' || substr(key, length('company#') + 1)
WHERE key LIKE 'company#%';
