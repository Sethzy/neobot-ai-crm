-- Enforce E.164 phone format on contacts and companies.
--
-- E.164: starts with +, followed by 1–15 digits (no spaces, dashes, parens).
-- Example: +12125551234, +6591234567
--
-- NOT VALID: the constraint is NOT checked against existing rows on this migration.
-- Only new inserts and updates must satisfy it. This avoids a full-table scan and
-- prevents failures on any legacy data that pre-dates normalisation.
-- Run VALIDATE CONSTRAINT separately (in a maintenance window) when existing data is clean.

ALTER TABLE contacts
  ADD CONSTRAINT contacts_phone_e164_format
  CHECK (phone IS NULL OR phone ~ '^\+[1-9]\d{1,14}$')
  NOT VALID;

ALTER TABLE companies
  ADD CONSTRAINT companies_phone_e164_format
  CHECK (phone IS NULL OR phone ~ '^\+[1-9]\d{1,14}$')
  NOT VALID;
