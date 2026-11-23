import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWorldBankPayload,
  sanitizeDiagnostic,
  WORLD_BANK_INDICATORS,
  worldBankApiUrl
} from '../supabase/functions/_shared/world-bank.mjs';

const fetchedAt = '2026-11-23T00:00:00.000Z';
const sourceUrl = 'https://api.worldbank.org/v2/country/COD/indicator/IT.NET.USER.ZS?format=json';

test('World Bank collector uses only reviewed indicator codes', () => {
  assert.deepEqual(WORLD_BANK_INDICATORS.map(item => item.code), [
    'FX.OWN.TOTL.ZS', 'IT.CEL.SETS.P2', 'IT.NET.USER.ZS', 'FB.ATM.TOTL.P5', 'NY.GDP.MKTP.KD.ZG'
  ]);
});

test('World Bank requests are country-specific, bounded and keyless', () => {
  const url = worldBankApiUrl('IT.NET.USER.ZS');
  assert.equal(url.origin, 'https://api.worldbank.org');
  assert.equal(url.pathname, '/v2/country/COD/indicator/IT.NET.USER.ZS');
  assert.equal(url.searchParams.get('mrnev'), '10');
  assert.equal(url.searchParams.get('per_page'), '10');
  assert.equal(url.searchParams.has('api_key'), false);
  assert.throws(() => worldBankApiUrl('not-a-real-indicator'));
});

test('normalization preserves COD period and source metadata and ignores null/invalid observations', () => {
  const payload = [
    { page: 1, pages: 1, total: 4 },
    [
      { countryiso3code: 'COD', date: '2024', value: 0, indicator: { value: 'Official test label' } },
      { countryiso3code: 'COD', date: '2023', value: null, indicator: { value: 'Official test label' } },
      { countryiso3code: 'COG', date: '2024', value: 25, indicator: { value: 'Other country' } },
      { countryiso3code: 'COD', date: 'unknown', value: 10, indicator: { value: 'Official test label' } }
    ]
  ];
  const rows = normalizeWorldBankPayload('IT.NET.USER.ZS', payload, fetchedAt, sourceUrl);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    provider: 'World Bank', indicator_code: 'IT.NET.USER.ZS', indicator_name: 'Official test label',
    country_code: 'COD', period: '2024', value: 0, unit: '% of population', source_url: sourceUrl, fetched_at: fetchedAt
  });
});

test('normalization accepts a valid empty World Bank series response', () => {
  assert.deepEqual(normalizeWorldBankPayload('FB.ATM.TOTL.P5', [{ total: 0 }, null], fetchedAt, sourceUrl), []);
});

test('diagnostics redact credentials, tokens and explicit secret values', () => {
  const value = sanitizeDiagnostic('Bearer abc.def.ghi secret=local-value https://example.test/path', ['local-value']);
  assert.doesNotMatch(value, /abc\.def\.ghi|local-value|example\.test/);
  assert.match(value, /redacted/);
});
