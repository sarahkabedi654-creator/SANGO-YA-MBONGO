-- Replace broad default client grants with the application's intended table access.
-- This migration changes ACLs, ensures RLS stays enabled, and does not modify rows
-- or policy definitions.
begin;

alter table public.articles enable row level security;
alter table public.sources enable row level security;
alter table public.indicator_data enable row level security;
alter table public.favorites enable row level security;

-- Revoke table-level client privileges (including REFERENCES, TRIGGER,
-- TRUNCATE and MAINTAIN) before restoring SELECT alone.
revoke all privileges on table public.articles, public.sources, public.indicator_data
  from public, anon, authenticated;
grant select on table public.articles, public.sources, public.indicator_data
  to anon, authenticated;

-- Favorites remain private and keep their existing per-user RLS policies.
revoke all privileges on table public.favorites
  from public, anon, authenticated;
grant select, insert, delete on table public.favorites to authenticated;

-- Keep the collector's required UPSERT access if it previously came from a
-- PUBLIC grant that is removed above. service_role is not revoked here.
grant select, insert, update
  on table public.articles, public.sources, public.collection_logs, public.indicator_data
  to service_role;

notify pgrst, 'reload schema';
commit;
