-- Gaia — schéma initial (spec 4.6).
-- App single-user pilotée uniquement depuis le process principal Electron
-- avec la clé service_role : pas de RLS, pas de distinction anon/authenticated.

create table if not exists conversation_messages (
  id bigint generated always as identity primary key,
  role text not null check (role in ('user', 'assistant')),
  content jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists conversation_summary (
  id text primary key default 'default',
  summary text not null,
  summarized_through_message_id bigint not null,
  updated_at timestamptz not null default now()
);

create table if not exists memory_facts (
  id bigint generated always as identity primary key,
  fact text not null,
  created_at timestamptz not null default now()
);

create table if not exists hud_cache (
  id text primary key default 'default',
  summary text not null,
  updated_at timestamptz not null default now()
);

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
