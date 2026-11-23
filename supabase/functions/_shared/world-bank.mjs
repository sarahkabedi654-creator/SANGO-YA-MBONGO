export const WORLD_BANK_INDICATORS = Object.freeze([
  {
    code: 'FX.OWN.TOTL.ZS',
    unit: '% of population ages 15+',
    source: 'https://data.worldbank.org/indicator/FX.OWN.TOTL.ZS'
  },
  {
    code: 'IT.CEL.SETS.P2',
    unit: 'subscriptions per 100 people',
    source: 'https://data.worldbank.org/indicator/IT.CEL.SETS.P2'
  },
  {
    code: 'IT.NET.USER.ZS',
    unit: '% of population',
    source: 'https://data.worldbank.org/indicator/IT.NET.USER.ZS'
  },
  {
    code: 'FB.ATM.TOTL.P5',
    unit: 'ATMs per 100,000 adults',
    source: 'https://data.worldbank.org/indicator/FB.ATM.TOTL.P5'
  },
  {
    code: 'NY.GDP.MKTP.KD.ZG',
    unit: 'annual %',
    source: 'https://data.worldbank.org/indicator/NY.GDP.MKTP.KD.ZG'
  }
]);

export function worldBankApiUrl(code) {
  if (!WORLD_BANK_INDICATORS.some(indicator => indicator.code === code)) {
    throw new Error('Unknown World Bank indicator code');
  }
  const url = new URL(`https://api.worldbank.org/v2/country/COD/indicator/${code}`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('mrnev', '10');
  url.searchParams.set('per_page', '10');
  return url;
}

export function normalizeWorldBankPayload(code, payload, fetchedAt, sourceUrl) {
  const config = WORLD_BANK_INDICATORS.find(indicator => indicator.code === code);
  if (!config) throw new Error('Unknown World Bank indicator code');
  if (!Array.isArray(payload)) throw new Error('Invalid World Bank response shape');
  const message = payload[0]?.message?.[0]?.value;
  if (typeof message === 'string') throw new Error(message);
  if (payload[1] !== null && !Array.isArray(payload[1])) throw new Error('Invalid World Bank response shape');
  const observations = payload[1] || [];

  return observations.flatMap(observation => {
    const number = observation?.value;
    const period = String(observation?.date ?? '');
    const name = observation?.indicator?.value;
    if (observation?.countryiso3code !== 'COD'
      || !/^\d{4}$/.test(period)
      || typeof name !== 'string'
      || typeof number !== 'number'
      || !Number.isFinite(number)) return [];

    return [{
      provider: 'World Bank',
      indicator_code: config.code,
      indicator_name: name,
      country_code: 'COD',
      period,
      value: number,
      unit: config.unit,
      source_url: sourceUrl,
      fetched_at: fetchedAt
    }];
  });
}

export function sanitizeDiagnostic(value, secrets = []) {
  let message = String(value ?? 'Unknown error')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/\b(authorization|apikey|api[_-]?key|token|secret|password)\b\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/\b(?:sb_publishable|sb_secret)_[A-Za-z0-9_-]+/gi, '[credential]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token]')
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[long value redacted]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[URL redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 240);
  for (const secret of secrets) if (secret) message = message.split(secret).join('[secret redacted]');
  return message;
}
