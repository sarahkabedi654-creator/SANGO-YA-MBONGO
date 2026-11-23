-- Aggregates are computed in PostgreSQL over the complete public article set.
-- Re-runnable; the function runs with the caller's privileges and RLS policies.
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
    select a.id, a.source, coalesce(nullif(a.topic, ''), 'Non classé') as topic,
           a.title, coalesce(a.description, '') as description, a.published_at
    from public.articles a
  ),
  daily as (
    select day_timestamp::date as day, count(a.id)::integer as count
    from bounds b
    cross join lateral generate_series(current_date - (b.days - 1), current_date, interval '1 day') as series(day_timestamp)
    left join visible_articles a on a.published_at >= day_timestamp and a.published_at < day_timestamp + interval '1 day'
    group by day_timestamp
    order by day_timestamp
  ),
  by_source as (
    select source as name, count(*)::integer as count
    from visible_articles group by source order by count(*) desc, source
  ),
  by_topic as (
    select topic as name, count(*)::integer as count
    from visible_articles group by topic order by count(*) desc, topic
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
-- Make the newly installed RPC visible to PostgREST without waiting for a cache refresh.
notify pgrst, 'reload schema';
