-- Sango ya Mbongo: schema Supabase re-executable.
-- Run this script in the Supabase SQL Editor. No credentials belong here.

create extension if not exists pgcrypto with schema extensions;

-- Stable source codes match the `source` values returned by collect-news.
create table if not exists public.sources (
  code text primary key,
  name text not null,
  provider text not null,
  homepage_url text,
  feed_url text,
  enabled boolean not null default true,
  status text not null default 'unknown',
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_article_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sources_status_check check (status in ('unknown','available','unavailable')),
  constraint sources_last_article_count_check check (last_article_count >= 0)
);

insert into public.sources (code,name,provider,homepage_url,feed_url)
values
  ('GDELT','GDELT','GDELT Project','https://www.gdeltproject.org/',null),
  ('NewsData.io','NewsData.io','NewsData.io','https://newsdata.io/','https://newsdata.io/'),
  ('TechCabal','TechCabal','TechCabal','https://techcabal.com/','https://techcabal.com/feed/')
on conflict (code) do update set
  name=excluded.name, provider=excluded.provider,
  homepage_url=excluded.homepage_url, feed_url=excluded.feed_url,
  updated_at=now();

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_id text,
  title text not null,
  description text,
  url text not null,
  image_url text,
  author text,
  published_at timestamptz,
  language text,
  country text,
  topic text,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint articles_url_unique unique (url)
);

-- Add/validate the source relation when upgrading the original articles table.
do $$ begin
  if not exists (select 1 from pg_constraint where conname='articles_source_fkey' and conrelid='public.articles'::regclass) then
    alter table public.articles add constraint articles_source_fkey
      foreign key (source) references public.sources(code) on update cascade on delete restrict not valid;
  end if;
end $$;

create index if not exists articles_published_at_idx on public.articles (published_at desc nulls last);
create index if not exists articles_source_published_at_idx on public.articles (source,published_at desc nulls last);
create index if not exists articles_topic_published_at_idx on public.articles (topic,published_at desc nulls last);
create index if not exists articles_fetched_at_idx on public.articles (fetched_at desc);

create table if not exists public.collection_logs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  source_code text not null references public.sources(code) on update cascade on delete restrict,
  status text not null,
  articles_found integer not null default 0,
  articles_saved integer not null default 0,
  error_code text,
  error_message text,
  warning_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  constraint collection_logs_status_check check (status in ('succeeded','failed')),
  constraint collection_logs_found_check check (articles_found >= 0),
  constraint collection_logs_saved_check check (articles_saved >= 0),
  constraint collection_logs_run_source_unique unique (run_id,source_code)
);
-- Safe upgrade for databases where collection_logs already existed.
alter table public.collection_logs
  add column if not exists error_code text,
  add column if not exists warning_message text;
create index if not exists collection_logs_completed_at_idx on public.collection_logs (completed_at desc);
create index if not exists collection_logs_source_completed_idx on public.collection_logs (source_code,completed_at desc);

create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  article_id uuid not null references public.articles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint favorites_pkey primary key (user_id,article_id)
);
create index if not exists favorites_article_id_idx on public.favorites (article_id);
create index if not exists favorites_user_created_idx on public.favorites (user_id,created_at desc);

create table if not exists public.indicator_data (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'World Bank',
  indicator_code text not null,
  indicator_name text not null,
  country_code text not null default 'COD',
  period text not null,
  value numeric,
  unit text,
  source_url text,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint indicator_data_period_unique unique (provider,indicator_code,country_code,period)
);
create index if not exists indicator_data_code_period_idx on public.indicator_data (indicator_code,country_code,period desc);
create index if not exists indicator_data_fetched_at_idx on public.indicator_data (fetched_at desc);

-- RLS: public reference/news data is readable; ingestion runs with service_role.
alter table public.sources enable row level security;
alter table public.articles enable row level security;
alter table public.collection_logs enable row level security;
alter table public.favorites enable row level security;
alter table public.indicator_data enable row level security;

-- Remove policies managed by this script before recreating them.
drop policy if exists sy_sources_public_read on public.sources;
drop policy if exists sy_articles_public_read on public.articles;
drop policy if exists sy_favorites_read_own on public.favorites;
drop policy if exists sy_favorites_insert_own on public.favorites;
drop policy if exists sy_favorites_delete_own on public.favorites;
drop policy if exists sy_indicator_data_public_read on public.indicator_data;

create policy sy_sources_public_read on public.sources for select to anon,authenticated using (enabled or status <> 'unknown');
create policy sy_articles_public_read on public.articles for select to anon,authenticated using (true);
create policy sy_favorites_read_own on public.favorites for select to authenticated using (auth.uid()=user_id);
create policy sy_favorites_insert_own on public.favorites for insert to authenticated with check (auth.uid()=user_id);
create policy sy_favorites_delete_own on public.favorites for delete to authenticated using (auth.uid()=user_id);
create policy sy_indicator_data_public_read on public.indicator_data for select to anon,authenticated using (true);
-- There is intentionally no client policy for collection_logs or public-data writes.

revoke all on public.collection_logs from public,anon,authenticated;
revoke all on public.sources,public.articles from public,anon,authenticated;
revoke all on public.favorites from public,anon,authenticated;
grant select on public.sources,public.articles to anon,authenticated;
grant select,insert,delete on public.favorites to authenticated;
grant select,insert,update on public.articles,public.sources,public.collection_logs to service_role;


-- Aggregates are computed in PostgreSQL for complete totals and charts.
create or replace function public.get_dashboard_analytics(p_days integer default 30)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select greatest(1, least(coalesce(p_days, 30), 365))::integer as days
  ),
  visible_articles as (
    select a.id, a.source, coalesce(nullif(a.topic, ''), 'Non classe') as topic,
           a.title, coalesce(a.description, '') as description, a.published_at
    from public.articles a
  ),
  daily as (
    select day_timestamp::date as day, count(a.id)::integer as count
    from bounds b
    cross join lateral generate_series(current_date - (b.days - 1), current_date, interval '1 day') as series(day_timestamp)
    left join visible_articles a on a.published_at >= day_timestamp and a.published_at < day_timestamp + interval '1 day'
    group by day_timestamp order by day_timestamp
  ),
  by_source as (
    select source as name, count(*)::integer as count from visible_articles group by source order by count(*) desc, source
  ),
  by_topic as (
    select topic as name, count(*)::integer as count from visible_articles group by topic order by count(*) desc, topic
  ),
  by_operator as (
    select brand as name, count(*)::integer as count
    from visible_articles a
    cross join lateral (values
      ('Airtel Money', a.title || ' ' || a.description ~* 'airtel[[:space:]]*money'),
      ('M-Pesa', a.title || ' ' || a.description ~* 'm[ -]?pesa'),
      ('Orange Money', a.title || ' ' || a.description ~* 'orange[[:space:]]*money'),
      ('Afrimoney', a.title || ' ' || a.description ~* 'afrimoney')
    ) detected(brand, matched)
    where matched group by brand order by count(*) desc, brand
  )
  select jsonb_build_object(
    'total_articles', (select count(*) from visible_articles),
    'recent_articles', (select count(*) from visible_articles a, bounds b where a.published_at >= now() - make_interval(days => b.days)),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('date', day, 'count', count) order by day) from daily), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count)) from by_source), '[]'::jsonb),
    'topics', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count)) from by_topic), '[]'::jsonb),
    'operators', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count)) from by_operator), '[]'::jsonb)
  );
$$;
revoke all on function public.get_dashboard_analytics(integer) from public;
grant execute on function public.get_dashboard_analytics(integer) to anon, authenticated;
notify pgrst, 'reload schema';


-- World Bank ingestion diagnostics and collector locks (also versioned as a migration).
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
