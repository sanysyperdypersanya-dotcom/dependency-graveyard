import type { ScannedDependency } from './parsers';

export type RegistrySnapshot = {
  latest: string;
  updatedAt?: string;
  registry: string;
};

const encodePath = (value: string) => value.split('/').map(encodeURIComponent).join('/');
const versionParts = (value: string) => value.replace(/^v/i, '').split(/[.+-]/).map((part) => /^\d+$/.test(part) ? Number(part) : part.toLowerCase());

export function compareVersions(left: string, right: string): number {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const x = a[index] ?? 0;
    const y = b[index] ?? 0;
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x > y ? 1 : -1;
    if (typeof x === 'number') return 1;
    if (typeof y === 'number') return -1;
    return String(x).localeCompare(String(y));
  }
  return 0;
}

async function getJson(url: string): Promise<any> {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(response.status === 404 ? 'Пакет не знайдено' : `Реєстр відповів HTTP ${response.status}`);
  return response.json();
}

export async function lookupRegistry(dependency: ScannedDependency): Promise<RegistrySnapshot | null> {
  const name = dependency.name.trim();
  if (!name || name === '—') return null;
  if (dependency.ecosystem === 'npm') {
    const data = await getJson(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
    const latest = data['dist-tags']?.latest;
    return latest ? { latest, updatedAt: data.time?.[latest], registry: 'npmjs.org' } : null;
  }
  if (dependency.ecosystem === 'PyPI') {
    const data = await getJson(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
    const latest = data.info?.version;
    const releaseFiles = data.releases?.[latest] ?? [];
    return latest ? { latest, updatedAt: releaseFiles[0]?.upload_time_iso_8601 ?? releaseFiles[0]?.upload_time, registry: 'pypi.org' } : null;
  }
  if (dependency.ecosystem === 'Maven') {
    const [group, artifact] = name.split(':');
    if (!group || !artifact) return null;
    const query = new URLSearchParams({ q: `g:${group} AND a:${artifact}`, rows: '1', wt: 'json' });
    const data = await getJson(`https://search.maven.org/solrsearch/select?${query}`);
    const match = data.response?.docs?.[0];
    return match?.latestVersion ? { latest: match.latestVersion, updatedAt: match.timestamp ? new Date(match.timestamp).toISOString() : undefined, registry: 'Maven Central' } : null;
  }
  if (dependency.ecosystem === 'Go') {
    const escaped = name.replace(/[A-Z]/g, (letter) => `!${letter.toLowerCase()}`);
    const data = await getJson(`https://proxy.golang.org/${encodePath(escaped)}/@latest`);
    return data.Version ? { latest: data.Version, updatedAt: data.Time, registry: 'proxy.golang.org' } : null;
  }
  if (dependency.ecosystem === 'Cargo') {
    const data = await getJson(`https://crates.io/api/v1/crates/${encodeURIComponent(name)}`);
    const crate = data.crate;
    const latest = crate?.max_stable_version ?? crate?.max_version;
    return latest ? { latest, updatedAt: crate.updated_at, registry: 'crates.io' } : null;
  }
  if (dependency.ecosystem === 'Packagist') {
    const data = await getJson(`https://repo.packagist.org/p2/${encodePath(name)}.json`);
    const versions: Array<{ version?: string; time?: string }> = data.packages?.[name] ?? [];
    const latest = versions.filter((version) => version.version && !version.version.includes('dev')).sort((a, b) => compareVersions(b.version!, a.version!))[0];
    return latest?.version ? { latest: latest.version.replace(/\.0$/, ''), updatedAt: latest.time, registry: 'Packagist' } : null;
  }
  if (dependency.ecosystem === 'RubyGems') {
    const data = await getJson(`https://rubygems.org/api/v1/gems/${encodeURIComponent(name)}.json`);
    return data.version ? { latest: data.version, updatedAt: data.version_created_at, registry: 'RubyGems' } : null;
  }
  if (dependency.ecosystem === 'NuGet') {
    const data = await getJson(`https://api.nuget.org/v3-flatcontainer/${encodeURIComponent(name.toLowerCase())}/index.json`);
    const versions: string[] = data.versions ?? [];
    const latest = versions.filter((version) => !version.includes('-')).sort((a, b) => compareVersions(b, a))[0];
    return latest ? { latest, registry: 'NuGet' } : null;
  }
  return null;
}

export function formatAge(isoDate?: string): string | undefined {
  if (!isoDate) return undefined;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return undefined;
  const years = Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  if (years < 1) {
    const months = Math.max(0, Math.floor((Date.now() - date.getTime()) / (30.44 * 24 * 60 * 60 * 1000)));
    return months < 1 ? 'менше місяця тому' : `${months} міс. тому`;
  }
  return `${years} ${years === 1 ? 'рік' : years < 5 ? 'роки' : 'років'} тому`;
}
