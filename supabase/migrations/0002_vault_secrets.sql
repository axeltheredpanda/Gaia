-- Secrets OAuth (Linear, Google) via Supabase Vault (spec 4.6) — jamais en
-- clair dans une table classique. Le schéma `vault` n'existe que sur un vrai
-- projet Supabase (extension pgsodium/vault), pas en local : ces fonctions
-- ne peuvent pas être exécutées hors Supabase.

create or replace function public.gaia_set_secret(secret_name text, secret_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_id uuid;
begin
  select id into existing_id from vault.secrets where name = secret_name;
  if existing_id is not null then
    perform vault.update_secret(existing_id, secret_value);
  else
    perform vault.create_secret(secret_value, secret_name);
  end if;
end;
$$;

create or replace function public.gaia_get_secret(secret_name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = secret_name limit 1;
$$;

grant execute on function public.gaia_set_secret(text, text) to service_role;
grant execute on function public.gaia_get_secret(text) to service_role;
