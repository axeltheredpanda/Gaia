-- Visibilité des coûts (spec 8.10) : un log par appel API, avec un coût estimé en $.
create table if not exists api_usage_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  label text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_5m_tokens integer not null default 0,
  cache_write_1h_tokens integer not null default 0,
  cost_usd numeric(10, 6) not null default 0
);

create index if not exists api_usage_log_created_at_idx on api_usage_log (created_at);
