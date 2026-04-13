-- Auto-lowercase email on insert/update for contacts and companies.
-- Defence-in-depth: the tool layer also lowercases, but this catches any
-- direct SQL writes or future tools that skip application validation.

CREATE OR REPLACE FUNCTION lowercase_email()
RETURNS trigger AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email := lower(NEW.email);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_lowercase_email
  BEFORE INSERT OR UPDATE OF email ON contacts
  FOR EACH ROW EXECUTE FUNCTION lowercase_email();

CREATE TRIGGER companies_lowercase_email
  BEFORE INSERT OR UPDATE OF email ON companies
  FOR EACH ROW EXECUTE FUNCTION lowercase_email();
