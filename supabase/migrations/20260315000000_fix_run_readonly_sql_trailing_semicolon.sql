-- Fix: strip trailing semicolon before multi-statement check.
-- LLMs naturally produce "SELECT ... FROM deals;" which the regex `;` check rejected.
CREATE OR REPLACE FUNCTION public.run_readonly_sql(query_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET statement_timeout = '10s'
AS $$
DECLARE
  result JSONB;
  cleaned_query TEXT;
BEGIN
  cleaned_query := btrim(query_text);

  IF cleaned_query = '' THEN
    RAISE EXCEPTION 'Query cannot be empty';
  END IF;

  -- Strip trailing semicolon (LLMs add these by habit)
  cleaned_query := regexp_replace(cleaned_query, ';\s*$', '');

  IF cleaned_query ~ ';' THEN
    RAISE EXCEPTION 'Only single-statement queries are allowed';
  END IF;

  IF cleaned_query !~* '^(select|with)\s' THEN
    RAISE EXCEPTION 'Only SELECT/CTE queries are allowed';
  END IF;

  SET LOCAL transaction_read_only = on;

  EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', cleaned_query)
    INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
