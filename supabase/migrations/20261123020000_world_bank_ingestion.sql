-- Idempotent persistence, diagnostics and mutual exclusion for World Bank ingestion.
create table if not exists public.indicator_collection_logs (
  run_id uuid primary key,
  status text not null check (status in ('succeeded','partial','failed')),
  indicators_requested integer not null default 0 check (indicators_requested >= 0),
  indicators_succeeded integer not null default 0 check (indicators_succeeded >= 0),
  observations_received integer not null default 0 check (observations_received >= 0),
  observations_upserted integer not null default 0 check (observations_upserted >= 0),
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz not null default now()
);
create index if not exists indicator_collection_logs_completed_idx
  on public.indicator_collection_logs (completed_at desc);
alter table public.indicator_collection_logs enable row level security;
revoke all on public.indicator_collection_logs from public, anon, authenticated, service_role;

create table if not exists public.collector_locks (
  lock_name text primary key,
  lock_token uuid not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.collector_locks enable row level security;
revoke all on public.collector_locks from public, anon, authenticated, service_role;

-- Edge ingestion uses PostgREST merge-duplicates (ON CONFLICT DO UPDATE).
-- Keep write access server-only and explicit rather than relying on project defaults.
alter table public.indicator_data enable row level security;
revoke all on public.indicator_data from public, anon, authenticated, service_role;
grant select on public.indicator_data to anon, authenticated;
grant select, insert, update on public.indicator_collection_logs to service_role;
grant select, insert, update on public.indicator_data to service_role;

create or replace function public.acquire_collector_lock(
  p_lock_name text,
  p_lock_token uuid,
  p_lease_seconds integer default 1800
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare acquired boolean := false;
begin
  if p_lock_name is null or length(p_lock_name) not between 1 and 80
     or p_lease_seconds not between 60 and 7200 then
    raise exception 'Invalid collector lock arguments';
  end if;
  insert into public.collector_locks(lock_name, lock_token, acquired_at, expires_at)
  values (p_lock_name, p_lock_token, now(), now() + make_interval(secs => p_lease_seconds))
  on conflict (lock_name) do update
    set lock_token = excluded.lock_token,
        acquired_at = excluded.acquired_at,
        expires_at = excluded.expires_at
    where public.collector_locks.expires_at <= now()
  returning true into acquired;
  return coalesce(acquired, false);
end;
$$;

create or replace function public.release_collector_lock(
  p_lock_name text,
  p_lock_token uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare released boolean := false;
begin
  delete from public.collector_locks
  where lock_name = p_lock_name and lock_token = p_lock_token
  returning true into released;
  return coalesce(released, false);
end;
$$;
revoke all on function public.acquire_collector_lock(text, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.release_collector_lock(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.acquire_collector_lock(text, uuid, integer) to service_role;
grant execute on function public.release_collector_lock(text, uuid) to service_role;

notify pgrst, 'reload schema';
