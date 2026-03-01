-- Migration: Remove UNIQUE constraint from ura_transactions and add nett_price column.
--
-- The UNIQUE(project, street, contract_date, price, area_sqm, floor_range) constraint
-- was silently collapsing identical-spec units from developer launches into single rows.
-- For Northwave alone this dropped ~360 of 488 transactions.
--
-- Strategy change: ura_transactions now uses truncate + insert (full refresh),
-- matching the pattern already used by cea_transactions and hdb_resale_transactions.

-- 1. Drop the UNIQUE constraint
ALTER TABLE ura_transactions
    DROP CONSTRAINT IF EXISTS ura_transactions_project_street_contract_date_price_area_sq_key;

-- 2. Add nett_price column (URA API field for discounted new sale prices)
ALTER TABLE ura_transactions
    ADD COLUMN IF NOT EXISTS nett_price NUMERIC;

-- 3. Allow truncate_property_table RPC to truncate ura_transactions
CREATE OR REPLACE FUNCTION truncate_property_table(table_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF table_name NOT IN ('cea_transactions', 'hdb_resale_transactions', 'ura_transactions') THEN
        RAISE EXCEPTION 'Table % not allowed for truncate', table_name;
    END IF;
    EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY', table_name);
END;
$$;

REVOKE ALL ON FUNCTION truncate_property_table(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION truncate_property_table(TEXT) TO service_role;
