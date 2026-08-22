-- Réglages V2 vocal : raccourci push-to-talk global et voix Piper (écran paramètres).
alter table app_settings add column if not exists ptt_shortcut_key text;
alter table app_settings add column if not exists piper_voice_name text;
