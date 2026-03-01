-- Property data schema for separate Supabase project
-- Safe to run on a dedicated property-data database.

DROP FUNCTION IF EXISTS truncate_property_table(TEXT);

DROP TABLE IF EXISTS cea_agent_movements CASCADE;
DROP TABLE IF EXISTS cea_transactions CASCADE;
DROP TABLE IF EXISTS cea_agents CASCADE;
DROP TABLE IF EXISTS hdb_resale_transactions CASCADE;
DROP TABLE IF EXISTS ura_transactions CASCADE;
DROP TABLE IF EXISTS pipeline_runs CASCADE;

CREATE TABLE cea_agents (
    registration_no TEXT PRIMARY KEY,
    salesperson_name TEXT NOT NULL,
    registration_start_date DATE,
    registration_end_date DATE,
    estate_agent_name TEXT,
    estate_agent_license_no TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- No FK to cea_agents: transactions include expired registrations not in current registry.
-- No UNIQUE constraint: dataset has no natural PK. Full refresh import strategy.
CREATE TABLE cea_transactions (
    id BIGSERIAL PRIMARY KEY,
    salesperson_name TEXT,
    salesperson_reg_num TEXT,
    transaction_date DATE,
    property_type TEXT,
    transaction_type TEXT,
    represented TEXT,
    town TEXT,
    district TEXT,
    general_location TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- No UNIQUE constraint: legitimate duplicate rows exist in source data.
CREATE TABLE hdb_resale_transactions (
    id BIGSERIAL PRIMARY KEY,
    month DATE NOT NULL,
    town TEXT NOT NULL,
    flat_type TEXT NOT NULL,
    block TEXT,
    street_name TEXT,
    storey_range TEXT,
    floor_area_sqm NUMERIC,
    flat_model TEXT,
    lease_commence_date INTEGER,
    remaining_lease TEXT,
    resale_price NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- No UNIQUE constraint: developer launches have many identical-spec units
-- (same project, street, date, price, area, floor) that are distinct transactions.
-- Full refresh import strategy (truncate + insert), matching CEA/HDB pattern.
CREATE TABLE ura_transactions (
    id BIGSERIAL PRIMARY KEY,
    project TEXT NOT NULL,
    street TEXT,
    market_segment TEXT,
    district TEXT,
    contract_date DATE,
    price NUMERIC,
    area_sqm NUMERIC,
    price_psf NUMERIC GENERATED ALWAYS AS (
        CASE WHEN area_sqm > 0 THEN ROUND(price / (area_sqm * 10.764), 2) ELSE NULL END
    ) STORED,
    floor_range TEXT,
    property_type TEXT,
    tenure TEXT,
    type_of_sale TEXT,
    type_of_area TEXT,
    nett_price NUMERIC,
    no_of_units INTEGER DEFAULT 1,
    x_coord TEXT,
    y_coord TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE cea_agent_movements (
    id BIGSERIAL PRIMARY KEY,
    registration_no TEXT NOT NULL,
    movement_date DATE NOT NULL,
    movement_type TEXT NOT NULL,
    from_agency TEXT,
    to_agency TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(registration_no, movement_date, movement_type, from_agency, to_agency)
);

CREATE TABLE pipeline_runs (
    id BIGSERIAL PRIMARY KEY,
    dataset TEXT NOT NULL,
    records_fetched INTEGER NOT NULL,
    records_upserted INTEGER NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cea_agents_agency ON cea_agents(estate_agent_name);
CREATE INDEX idx_cea_txn_reg_num ON cea_transactions(salesperson_reg_num);
CREATE INDEX idx_cea_txn_date ON cea_transactions(transaction_date);
CREATE INDEX idx_cea_txn_property_type ON cea_transactions(property_type);
CREATE INDEX idx_cea_txn_town ON cea_transactions(town);
CREATE INDEX idx_cea_txn_district ON cea_transactions(district);
CREATE INDEX idx_hdb_month ON hdb_resale_transactions(month);
CREATE INDEX idx_hdb_town ON hdb_resale_transactions(town);
CREATE INDEX idx_hdb_street ON hdb_resale_transactions(street_name);
CREATE INDEX idx_hdb_flat_type ON hdb_resale_transactions(flat_type);
CREATE INDEX idx_ura_project ON ura_transactions(project);
CREATE INDEX idx_ura_street ON ura_transactions(street);
CREATE INDEX idx_ura_contract_date ON ura_transactions(contract_date);
CREATE INDEX idx_ura_district ON ura_transactions(district);
CREATE INDEX idx_ura_property_type ON ura_transactions(property_type);
CREATE INDEX idx_movements_reg_no ON cea_agent_movements(registration_no);

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

ALTER TABLE cea_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE cea_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hdb_resale_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ura_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cea_agent_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_read_cea_agents
ON cea_agents
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY public_read_cea_transactions
ON cea_transactions
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY public_read_hdb_resale
ON hdb_resale_transactions
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY public_read_ura_transactions
ON ura_transactions
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY public_read_agent_movements
ON cea_agent_movements
FOR SELECT
TO anon, authenticated
USING (true);
