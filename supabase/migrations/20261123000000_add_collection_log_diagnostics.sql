-- Diagnostic metadata only; preserves all existing collection records.
begin;

alter table public.collection_logs
  add column if not exists error_code text,
  add column if not exists warning_message text;

comment on column public.collection_logs.error_code is
  'Structured, non-secret SQLSTATE, PostgREST code, or HTTP status for a failed collection/storage operation.';
comment on column public.collection_logs.warning_message is
  'Sanitized non-fatal warning, such as a failed source status upsert after successful article collection.';

notify pgrst, 'reload schema';

commit;
