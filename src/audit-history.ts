import type { ScannedDependency } from './parsers';

const STORAGE_KEY = 'dependency-graveyard:audit-history:v1';
const MAX_RECORDS = 10;

export type AuditRecord = {
  id: string;
  scannedAt: string;
  fileCount: number;
  totalPackages: number;
  findings: number;
  critical: number;
  stale: number;
  ecosystems: string[];
  packages: ScannedDependency[];
  findingKeys: string[];
  comparedToPrevious: boolean;
  newFindingKeys: string[];
  resolvedFindingKeys: string[];
};

export function loadAuditHistory(): AuditRecord[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(data)) return [];
    return data.filter((item): item is AuditRecord => item && typeof item.id === 'string' && typeof item.scannedAt === 'string' && Array.isArray(item.packages));
  } catch {
    return [];
  }
}

export function saveAuditHistory(record: AuditRecord): { records: AuditRecord[]; saved: boolean } {
  const records = [record, ...loadAuditHistory()].slice(0, MAX_RECORDS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return { records, saved: true };
  } catch {
    return { records, saved: false };
  }
}

export function removeAuditHistory(): boolean {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function createAuditRecord(
  packages: ScannedDependency[],
  findings: Array<{ name: string; ecosystem: string; severity: string }>,
  fileCount: number,
  previous?: AuditRecord,
): AuditRecord {
  const key = (item: { name: string; ecosystem: string }) => `${item.ecosystem.toLowerCase()}:${item.name.toLowerCase()}`;
  const findingKeys = findings.map(key);
  const previousSet = new Set(previous?.findingKeys ?? []);
  const currentSet = new Set(findingKeys);
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    scannedAt: new Date().toISOString(),
    fileCount,
    totalPackages: packages.length,
    findings: findings.length,
    critical: findings.filter((item) => item.severity === 'Критично').length,
    stale: findings.filter((item) => item.severity !== 'Критично').length,
    ecosystems: [...new Set(packages.map((item) => item.ecosystem))],
    packages,
    findingKeys,
    comparedToPrevious: Boolean(previous),
    newFindingKeys: previous ? findingKeys.filter((item) => !previousSet.has(item)) : [],
    resolvedFindingKeys: previous ? previous.findingKeys.filter((item) => !currentSet.has(item)) : [],
  };
}
