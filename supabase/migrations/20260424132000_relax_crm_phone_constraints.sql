-- Align CRM phone CHECK constraints with the save-time validator contract.
--
-- We still prefer canonical E.164 at the application layer, but the database
-- must also allow plausible local numbers that contain at least 7 digits.
-- This matches validatePhoneForSave(), which stores raw input when libphonenumber
-- cannot canonicalize it but the digit count is still plausible.

ALTER TABLE contacts
  DROP CONSTRAINT IF EXISTS contacts_phone_e164_format;

ALTER TABLE contacts
  ADD CONSTRAINT contacts_phone_plausible_format
  CHECK (
    phone IS NULL
    OR phone ~ '^\+[1-9]\d{1,14}$'
    OR length(regexp_replace(phone, '\D', '', 'g')) >= 7
  )
  NOT VALID;

ALTER TABLE companies
  DROP CONSTRAINT IF EXISTS companies_phone_e164_format;

ALTER TABLE companies
  ADD CONSTRAINT companies_phone_plausible_format
  CHECK (
    phone IS NULL
    OR phone ~ '^\+[1-9]\d{1,14}$'
    OR length(regexp_replace(phone, '\D', '', 'g')) >= 7
  )
  NOT VALID;
