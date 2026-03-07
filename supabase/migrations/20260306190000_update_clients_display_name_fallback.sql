-- Prefer richer auth profile metadata for client display names, including social sign-ins.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.clients (user_id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'name', ''),
      NEW.email
    )
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS 'Creates public.clients row on auth signup using the best available profile name.';

UPDATE public.clients AS clients
SET display_name = COALESCE(
  NULLIF(users.raw_user_meta_data->>'display_name', ''),
  NULLIF(users.raw_user_meta_data->>'full_name', ''),
  NULLIF(users.raw_user_meta_data->>'name', ''),
  users.email
)
FROM auth.users AS users
WHERE clients.user_id = users.id
  AND (
    clients.display_name IS NULL
    OR clients.display_name = users.email
  );
