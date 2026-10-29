-- Update only the product name; preserve the office name, timezone and other settings.
UPDATE aeams.system_settings
SET value = jsonb_set(value, '{system_name}', to_jsonb('Agricultural Equipment and Asset Management System'::text))
WHERE key = 'organization';
