import {
  normalizeWorldBankPayload,
  sanitizeDiagnostic,
  WORLD_BANK_INDICATORS,
  worldBankApiUrl
} from '../_shared/world-bank.mjs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json' }
});

async function validateCaller(request: Request): Promise<boolean | 'unconfigured'> {
  const expectedSecret = Deno.env.get('COLLECT_NEWS_CRON_SECRET');
  const providedSecret = request.headers.get('x-cron-secret');
  if (expectedSecret && providedSecret && providedSecret.length === expectedSecret.length) {
    let difference = 0;
    for (let index = 0; index < expectedSecret.length; index++) {
      difference |= expectedSecret.charCodeAt(index) ^ providedSecret.charCodeAt(index);
    }
    if (difference === 0) return true;
  }

  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const projectUrl = Deno.env.get('SUPABASE_URL');
  let publicKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!publicKey) {
    try { publicKey = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default; }
    catch { publicKey = undefined; }
  }
  if (!projectUrl || !publicKey) return 'unconfigured';
  if (!bearer) return false;
  const response = await fetch(`${projectUrl}/auth/v1/user`, {
    headers: { apikey: publicKey, Authorization: `Bearer ${bearer}` },
    signal: AbortSignal.timeout(8000)
  });
  return response.ok;
}

const serviceHeaders = (serviceKey: string) => ({
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json'
});

async function acquireLock(url: string, key: string, runId: string): Promise<boolean> {
  const response = await fetch(`${url}/rest/v1/rpc/acquire_collector_lock`, {
    method: 'POST',
    headers: serviceHeaders(key),
    body: JSON.stringify({ p_lock_name: 'world-bank-indicators', p_lock_token: runId, p_lease_seconds: 1800 }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`Lock acquisition HTTP ${response.status}`);
  return response.json();
}

async function releaseLock(url: string, key: string, runId: string): Promise<void> {
  const response = await fetch(`${url}/rest/v1/rpc/release_collector_lock`, {
    method: 'POST', headers: serviceHeaders(key),
    body: JSON.stringify({ p_lock_name: 'world-bank-indicators', p_lock_token: runId }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`Lock release HTTP ${response.status}`);
}

function safeMessage(error: unknown): string {
  const secrets = [
    Deno.env.get('COLLECT_NEWS_CRON_SECRET'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    Deno.env.get('SUPABASE_ANON_KEY')
  ];
  return sanitizeDiagnostic(error instanceof Error ? error.message : error, secrets);
}

async function fetchIndicator(code: string, fetchedAt: string) {
  const url = worldBankApiUrl(code);
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`World Bank HTTP ${response.status}`);
  const payload = await response.json();
  return normalizeWorldBankPayload(code, payload, fetchedAt, url.toString());
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  try {
    const authorized = await validateCaller(request);
    if (authorized === 'unconfigured') return json({ error: 'Configuration Supabase serveur incomplète' }, 503);
    if (!authorized) return json({ error: 'Une session utilisateur valide est requise' }, 401);
  } catch {
    return json({ error: 'Vérification de session indisponible' }, 503);
  }

  const projectUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!projectUrl || !serviceKey) return json({ error: 'Configuration de stockage serveur incomplète' }, 503);

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  let locked = false;
  try { locked = await acquireLock(projectUrl, serviceKey, runId); }
  catch (error) { return json({ error: 'Verrou de collecte indisponible', detail: safeMessage(error) }, 503); }
  if (!locked) return json({ skipped: true, reason: 'Une collecte World Bank est déjà en cours', run_id: runId }, 202);

  let statusCode = 200;
  let responseBody: Record<string, unknown>;
  const headers = serviceHeaders(serviceKey);
  const outcomes = await Promise.allSettled(
    WORLD_BANK_INDICATORS.map(indicator => fetchIndicator(indicator.code, startedAt))
  );
  const successful = outcomes.flatMap((outcome, index) => outcome.status === 'fulfilled'
    ? [{ code: WORLD_BANK_INDICATORS[index].code, records: outcome.value }]
    : []);
  const errors = outcomes.flatMap((outcome, index) => outcome.status === 'rejected'
    ? [{ code: WORLD_BANK_INDICATORS[index].code, message: safeMessage(outcome.reason) }]
    : []);
  const rows = successful.flatMap(item => item.records);
  let observationsUpserted = 0;
  let storageError: string | null = null;

  try {
    if (rows.length) {
      const response = await fetch(`${projectUrl}/rest/v1/indicator_data?on_conflict=provider,indicator_code,country_code,period`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) throw new Error(`Indicator upsert HTTP ${response.status}: ${await response.text()}`);
      observationsUpserted = rows.length;
    }
  } catch (error) {
    storageError = safeMessage(error);
    console.error(JSON.stringify({ event: 'world_bank_indicator_upsert_failed', run_id: runId, error: storageError }));
  }

  const failedCount = errors.length + (storageError ? 1 : 0);
  const logStatus = failedCount === 0 ? 'succeeded' : successful.length ? 'partial' : 'failed';
  const errorText = [
    ...errors.map(error => `${error.code}: ${error.message}`),
    ...(storageError ? [`STORAGE: ${storageError}`] : [])
  ].join(' | ').slice(0, 1000) || null;
  try {
    const response = await fetch(`${projectUrl}/rest/v1/indicator_collection_logs?on_conflict=run_id`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        run_id: runId,
        status: logStatus,
        indicators_requested: WORLD_BANK_INDICATORS.length,
        indicators_succeeded: successful.length,
        observations_received: rows.length,
        observations_upserted: storageError ? 0 : observationsUpserted,
        error_code: errors.length ? 'WORLD_BANK_SOURCE_ERROR' : storageError ? 'DATABASE_UPSERT_ERROR' : null,
        error_message: errorText,
        started_at: startedAt,
        completed_at: new Date().toISOString()
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`Collection log HTTP ${response.status}: ${await response.text()}`);
  } catch (error) {
    console.error(JSON.stringify({ event: 'world_bank_log_upsert_failed', run_id: runId, error: safeMessage(error) }));
    statusCode = 207;
  }

  responseBody = {
    run_id: runId,
    status: logStatus,
    indicators_requested: WORLD_BANK_INDICATORS.length,
    indicators_succeeded: successful.length,
    observations_received: rows.length,
    observations_upserted: storageError ? 0 : observationsUpserted,
    errors,
    ...(storageError ? { storage_error: storageError } : {})
  };
  if (logStatus === 'failed') statusCode = 502;
  else if (logStatus === 'partial' && statusCode === 200) statusCode = 207;

  try { await releaseLock(projectUrl, serviceKey, runId); }
  catch (error) {
    console.error(JSON.stringify({ event: 'world_bank_lock_release_failed', run_id: runId, error: safeMessage(error) }));
  }
  return json(responseBody, statusCode);
});
