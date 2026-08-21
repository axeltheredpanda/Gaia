-- Mémoire continue à deux niveaux (core / peripheral) — voir docs/PROJECT_SPEC.md.
-- Additive sur 0001_init.sql (déjà appliquée) : ne pas modifier les migrations passées.

alter table memory_facts rename column fact to content;
alter table memory_facts add column if not exists category text;
alter table memory_facts add column if not exists tier text not null default 'peripheral'
  check (tier in ('core', 'peripheral'));
alter table memory_facts add column if not exists updated_at timestamptz not null default now();
