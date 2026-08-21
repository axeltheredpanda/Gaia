-- Réglages simples, une seule ligne (spec 8.1 sources du briefing, 8.8 écran paramètres).
create table if not exists app_settings (
  id text primary key default 'default',
  rss_feeds jsonb,
  weather_city_override text,
  updated_at timestamptz not null default now()
);
