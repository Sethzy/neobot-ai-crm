-- Enforce non-negative finite deal amounts at the DB level.
-- NOT VALID skips scanning existing rows (fast deploy), but enforces on new writes.
ALTER TABLE deals
  ADD CONSTRAINT deals_amount_non_negative
  CHECK (amount IS NULL OR (amount >= 0 AND amount < 1e15))
  NOT VALID;
