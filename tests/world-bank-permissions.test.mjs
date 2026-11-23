import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8').toLowerCase();
const migration = readFileSync(new URL('../supabase/migrations/20261123020000_world_bank_ingestion.sql', import.meta.url), 'utf8').toLowerCase();
const hardening = readFileSync(new URL('../supabase/migrations/20261123030000_harden_public_table_privileges.sql', import.meta.url), 'utf8').toLowerCase();
const edge = readFileSync(new URL('../supabase/functions/collect-world-bank/index.ts', import.meta.url), 'utf8');

function assertServerUpsertGrants(sql, label) {
  for (const table of ['indicator_collection_logs', 'indicator_data']) {
    assert.match(sql, new RegExp(`grant\\s+select\\s*,\\s*insert\\s*,\\s*update\\s+on\\s+public\\.${table}\\s+to\\s+service_role\\s*;`), `${label}: ${table} must grant the UPSERT privileges to service_role`);
  }
  assert.match(sql, /revoke\s+all\s+on\s+public\.indicator_data\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role\s*;/, `${label}: indicator_data must be re-granted explicitly`);
  assert.match(sql, /grant\s+select\s+on\s+public\.indicator_data\s+to\s+anon\s*,\s*authenticated\s*;/, `${label}: clients keep read-only indicator access`);
  assert.match(sql, /revoke\s+all\s+on\s+public\.indicator_collection_logs\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role\s*;/, `${label}: collection logs must remain private except for explicit server grants`);
  assert.match(sql, /revoke\s+all\s+on\s+public\.collector_locks\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role\s*;/, `${label}: lock table must only be accessed through its RPCs`);
}

test('World Bank upsert privileges are explicit and consistent in schema and migration', () => {
  assertServerUpsertGrants(schema, 'schema.sql');
  assertServerUpsertGrants(migration, 'World Bank migration');

  for (const table of ['indicator_collection_logs', 'indicator_data']) {
    const tableCreated = schema.indexOf(`create table if not exists public.${table}`);
    const grantAdded = schema.indexOf(`grant select, insert, update on public.${table} to service_role;`);
    assert.notEqual(tableCreated, -1, `schema.sql must create ${table}`);
    assert.ok(grantAdded > tableCreated, `schema.sql must grant ${table} only after its creation`);
  }
  assert.ok(migration.indexOf('create table if not exists public.indicator_collection_logs') < migration.indexOf('grant select, insert, update on public.indicator_collection_logs to service_role;'));
  assert.ok(migration.indexOf('create table if not exists public.collector_locks') < migration.indexOf('grant select, insert, update on public.indicator_data to service_role;'));
});

test('World Bank handler upserts only the tables covered by the server grants', () => {
  assert.match(edge, /indicator_data\?on_conflict=provider,indicator_code,country_code,period/);
  assert.match(edge, /indicator_collection_logs\?on_conflict=run_id/);
  assert.equal((edge.match(/resolution=merge-duplicates,return=minimal/g) || []).length, 2);
});

test('collector lock RPCs remain service-role-only and security definer functions pin search_path', () => {
  for (const rpc of ['acquire_collector_lock(text, uuid, integer)', 'release_collector_lock(text, uuid)']) {
    for (const sql of [migration, schema]) {
      assert.ok(sql.includes(`revoke all on function public.${rpc} from public, anon, authenticated, service_role;`));
      assert.ok(sql.includes(`grant execute on function public.${rpc} to service_role;`));
    }
  }
  assert.doesNotMatch(migration, /grant\s+select\s*,\s*insert\s*,\s*update\s*,\s*delete\s+on\s+public\.collector_locks/);
  assert.equal((migration.match(/security definer\s+set search_path = ''/g) || []).length, 2);
});

test('public table hardening grants clients only intended operations and preserves RLS policies', () => {
  for (const table of ['articles', 'sources', 'indicator_data']) {
    assert.ok(hardening.includes(`revoke all privileges on table public.${table}`) || hardening.includes('revoke all privileges on table public.articles, public.sources, public.indicator_data'));
  }
  assert.match(hardening, /revoke all privileges on table public\.articles, public\.sources, public\.indicator_data\s+from public, anon, authenticated;/);
  assert.match(hardening, /grant select on table public\.articles, public\.sources, public\.indicator_data\s+to anon, authenticated;/);
  assert.match(hardening, /revoke all privileges on table public\.favorites\s+from public, anon, authenticated;/);
  assert.match(hardening, /grant select, insert, delete on table public\.favorites to authenticated;/);
  assert.doesNotMatch(hardening, /grant\s+\w+[^;]*\bon\s+table\s+public\.favorites\s+to\s+anon\b/);
  assert.doesNotMatch(hardening, /drop policy|create policy/i);
  for (const table of ['articles', 'sources', 'indicator_data', 'favorites']) {
    assert.ok(hardening.includes(`alter table public.${table} enable row level security;`));
  }
  assert.match(hardening, /grant select, insert, update\s+on table public\.articles, public\.sources, public\.collection_logs, public\.indicator_data\s+to service_role;/);
  assert.doesNotMatch(hardening, /^revoke[^;]*\bservice_role\b/im, 'hardening must preserve existing service_role privileges');
  assert.match(schema, /revoke all on public\.favorites from public,anon,authenticated;/);
  assert.match(schema, /grant select,insert,delete on public\.favorites to authenticated;/);
  assert.match(schema, /create policy sy_favorites_read_own[^;]*auth\.uid\(\)=user_id/i);
  assert.match(schema, /create policy sy_favorites_insert_own[^;]*auth\.uid\(\)=user_id/i);
  assert.match(schema, /create policy sy_favorites_delete_own[^;]*auth\.uid\(\)=user_id/i);
});
