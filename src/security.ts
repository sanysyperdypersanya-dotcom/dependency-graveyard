import type { ScannedDependency } from './parsers';

export type OsvAdvisory = {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  severity?: Array<{ type?: string; score?: string }>;
};

export type OsvPackageResult = ScannedDependency & { vulnerabilities: OsvAdvisory[] };

const osvEcosystem: Record<string, string> = {
  npm: 'npm', PyPI: 'PyPI', Maven: 'Maven', Go: 'Go', Cargo: 'crates.io',
  Packagist: 'Packagist', RubyGems: 'RubyGems', NuGet: 'NuGet',
};

function canonicalName(item: ScannedDependency): string {
  if (item.ecosystem === 'PyPI') return item.name.toLowerCase().replace(/[-_.]+/g, '-');
  if (['npm', 'Cargo', 'Packagist', 'RubyGems', 'NuGet'].includes(item.ecosystem)) return item.name.toLowerCase();
  return item.name;
}

async function postBatch(queries: Array<Record<string, unknown>>): Promise<any> {
  const response = await fetch('https://api.osv.dev/v1/querybatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ queries }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`OSV відповів HTTP ${response.status}`);
  return response.json();
}

async function getAdvisory(id: string): Promise<OsvAdvisory> {
  const response = await fetch(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`, {
    headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Не вдалося отримати advisory ${id}`);
  return response.json();
}

export async function queryOsv(dependencies: ScannedDependency[]): Promise<{ results: OsvPackageResult[]; skipped: number }> {
  const eligible = dependencies.filter((item) => osvEcosystem[item.ecosystem] && item.version && item.version !== '—');
  const skipped = dependencies.length - eligible.length;
  const resultIds: string[][] = eligible.map(() => []);

  for (let start = 0; start < eligible.length; start += 100) {
    const chunk = eligible.slice(start, start + 100);
    let pending = chunk.map((item, index) => ({
      originalIndex: start + index,
      query: { package: { name: canonicalName(item), ecosystem: osvEcosystem[item.ecosystem] }, version: item.version } as Record<string, unknown>,
    }));
    while (pending.length) {
      const response = await postBatch(pending.map(({ query }) => query));
      const next: typeof pending = [];
      for (let index = 0; index < pending.length; index += 1) {
        const item = pending[index];
        const result = response.results?.[index] ?? {};
        resultIds[item.originalIndex].push(...(result.vulns ?? []).map((vulnerability: { id: string }) => vulnerability.id));
        if (result.next_page_token) next.push({ originalIndex: item.originalIndex, query: { ...item.query, page_token: result.next_page_token } });
      }
      pending = next;
    }
  }

  const uniqueIds = [...new Set(resultIds.flat())];
  const advisoryMap = new Map<string, OsvAdvisory>();
  let cursor = 0;
  const worker = async () => {
    while (cursor < uniqueIds.length) {
      const id = uniqueIds[cursor++];
      try { advisoryMap.set(id, await getAdvisory(id)); } catch { advisoryMap.set(id, { id, summary: 'Деталі advisory тимчасово недоступні' }); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, uniqueIds.length) }, worker));

  return {
    skipped,
    results: eligible.map((item, index) => ({ ...item, vulnerabilities: [...new Set(resultIds[index])].map((id) => advisoryMap.get(id) ?? { id }) })),
  };
}
