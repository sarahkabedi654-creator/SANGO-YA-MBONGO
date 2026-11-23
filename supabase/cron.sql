-- SANGO YA MBONGO: collecte automatique des actualites, toutes les 4 heures.
-- Prerequis: stocker ces trois entrees dans Supabase Vault via Dashboard > Integrations > Vault:
--   sango_project_url          = URL API du projet Supabase
--   sango_publishable_key      = cle publishable du projet (pas une cle secret/service role)
--   sango_collect_news_cron_secret = meme valeur que COLLECT_NEWS_CRON_SECRET dans Edge Function Secrets
-- Aucun secret ne doit etre colle dans ce fichier SQL.

create schema if not exists extensions;
create schema if not exists vault;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $$
declare missing_names text[];
begin
  select array_agg(required.name)
    into missing_names
    from (values
      ('sango_project_url'),
      ('sango_publishable_key'),
      ('sango_collect_news_cron_secret')
    ) as required(name)
    where not exists (
      select 1 from vault.decrypted_secrets stored
      where stored.name=required.name and nullif(trim(stored.decrypted_secret),'') is not null
    );
  if missing_names is not null then
    raise exception 'Add the required named credentials to Supabase Vault before scheduling: %', array_to_string(missing_names, ', ');
  end if;
end $$;

-- pg_cron replaces a job when cron.schedule receives an existing job name.
select cron.schedule(
  'sango-collect-news-every-four-hours',
  '0 */4 * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='sango_project_url') || '/functions/v1/collect-news',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'apikey',(select decrypted_secret from vault.decrypted_secrets where name='sango_publishable_key'),
        'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='sango_collect_news_cron_secret')
      ),
      body := jsonb_build_object('trigger','scheduled'),
      timeout_milliseconds := 60000
    ) as request_id;
  $job$
);

-- World Bank series are refreshed weekly; the public API has no API-key requirement.
-- The existing Vault URL, publishable key and Cron secret are reused.
select cron.schedule(
  'sango-world-bank-indicators-weekly',
  '0 6 * * 1',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='sango_project_url') || '/functions/v1/collect-world-bank',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'apikey',(select decrypted_secret from vault.decrypted_secrets where name='sango_publishable_key'),
        'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='sango_collect_news_cron_secret')
      ),
      body := jsonb_build_object('trigger','scheduled'),
      timeout_milliseconds := 60000
    ) as request_id;
  $job$
);

-- Verification queries (run separately after the schedule has been created):
-- select jobid,jobname,schedule,active from cron.job where jobname='sango-collect-news-every-four-hours';
-- select jobid,status,return_message,start_time,end_time from cron.job_run_details order by start_time desc limit 20;
