import { detectManifest, parseManifest, supportedManifests, type ManifestInfo, type ScannedDependency } from './parsers';
import { compareVersions, formatAge, lookupRegistry, type RegistrySnapshot } from './registry';
import { queryOsv } from './security';
import { getRecommendation } from './recommendations';
import { createAuditRecord, loadAuditHistory, removeAuditHistory, saveAuditHistory, type AuditRecord } from './audit-history';
import { supabase } from './auth';
import type { Provider, Session } from '@supabase/supabase-js';

type Severity = "Критично" | "Застаріло";
type Dependency = {
  name: string;
  description: string;
  severity: Severity;
  version: string;
  latest: string;
  updated: string;
  alternative: string;
  alternativeNote: string;
  risk: number;
  ecosystem: string;
};

const dependencies: Dependency[] = [
  { name: "moment", description: "Парсинг і форматування дат", severity: "Критично", version: "2.24.0", latest: "2.30.1", updated: "4 роки тому", alternative: "date-fns", alternativeNote: "менший розмір · tree-shakeable", risk: 96, ecosystem: "npm" },
  { name: "request", description: "HTTP-клієнт для Node.js", severity: "Критично", version: "2.88.2", latest: "—", updated: "5 років тому", alternative: "undici", alternativeNote: "вбудований у Node.js 18+", risk: 91, ecosystem: "npm" },
  { name: "lodash", description: "Утиліти для роботи з даними", severity: "Застаріло", version: "4.17.15", latest: "4.17.21", updated: "3 роки тому", alternative: "es-toolkit", alternativeNote: "сучасна та легша альтернатива", risk: 68, ecosystem: "npm" },
  { name: "core-js", description: "Polyfills для JavaScript", severity: "Застаріло", version: "2.6.12", latest: "3.45.0", updated: "3 роки тому", alternative: "core-js", alternativeNote: "оновити до версії 3.x", risk: 54, ecosystem: "npm" },
  { name: "uuid", description: "Генератор UUID", severity: "Застаріло", version: "3.4.0", latest: "13.0.0", updated: "2 роки тому", alternative: "crypto.randomUUID", alternativeNote: "нативний API платформи", risk: 41, ecosystem: "npm" },
  { name: "node-sass", description: "Компілятор Sass для Node.js", severity: "Критично", version: "4.14.1", latest: "—", updated: "4 роки тому", alternative: "sass", alternativeNote: "офіційна Dart Sass реалізація", risk: 87, ecosystem: "npm" },
  { name: "webpack", description: "Пакувальник модулів", severity: "Застаріло", version: "4.46.0", latest: "5.101.3", updated: "2 роки тому", alternative: "vite", alternativeNote: "швидкий збирач із HMR", risk: 62, ecosystem: "npm" },
  { name: "request-promise", description: "Promise-обгортка над request", severity: "Критично", version: "4.2.6", latest: "—", updated: "5 років тому", alternative: "fetch", alternativeNote: "стандартний API платформи", risk: 89, ecosystem: "npm" },
  { name: "babel-eslint", description: "Парсер ESLint для Babel", severity: "Застаріло", version: "10.1.0", latest: "—", updated: "4 роки тому", alternative: "@babel/eslint-parser", alternativeNote: "підтримується командою Babel", risk: 47, ecosystem: "npm" },
  { name: "left-pad", description: "Доповнення рядків зліва", severity: "Застаріло", version: "1.3.0", latest: "1.3.0", updated: "7 років тому", alternative: "padStart", alternativeNote: "вбудований метод рядка", risk: 38, ecosystem: "npm" },
  { name: "gulp-util", description: "Утиліти для Gulp", severity: "Критично", version: "3.0.8", latest: "—", updated: "6 років тому", alternative: "розділені пакети", alternativeNote: "gulp-log, fancy-log та інші", risk: 82, ecosystem: "npm" },
  { name: "tslint", description: "Лінтер для TypeScript", severity: "Застаріло", version: "6.1.3", latest: "—", updated: "4 роки тому", alternative: "eslint", alternativeNote: "typescript-eslint", risk: 57, ecosystem: "npm" },
  { name: "nose", description: "Тестовий фреймворк для Python", severity: "Критично", version: "1.3.7", latest: "—", updated: "8 років тому", alternative: "pytest", alternativeNote: "активний фреймворк для тестування", risk: 88, ecosystem: "PyPI" },
  { name: "log4j:log4j", description: "Бібліотека логування для Java", severity: "Критично", version: "1.2.17", latest: "—", updated: "10 років тому", alternative: "org.apache.logging.log4j:log4j-core", alternativeNote: "перехід потребує оновлення конфігурації", risk: 98, ecosystem: "Maven" },
  { name: "github.com/dgrijalva/jwt-go", description: "JWT-бібліотека для Go", severity: "Критично", version: "3.2.0", latest: "—", updated: "6 років тому", alternative: "github.com/golang-jwt/jwt", alternativeNote: "підтримуване продовження проєкту", risk: 94, ecosystem: "Go" },
  { name: "github.com/satori/go.uuid", description: "Генератор UUID для Go", severity: "Застаріло", version: "1.2.0", latest: "—", updated: "7 років тому", alternative: "github.com/google/uuid", alternativeNote: "підтримувана бібліотека UUID", risk: 66, ecosystem: "Go" },
  { name: "failure", description: "Обробка помилок у Rust", severity: "Критично", version: "0.1.8", latest: "—", updated: "6 років тому", alternative: "anyhow або thiserror", alternativeNote: "залежно від типу обробки помилок", risk: 86, ecosystem: "Cargo" },
  { name: "ansi_term", description: "Кольоровий вивід у терміналі Rust", severity: "Застаріло", version: "0.12.1", latest: "—", updated: "5 років тому", alternative: "owo-colors", alternativeNote: "активна бібліотека кольорового виводу", risk: 62, ecosystem: "Cargo" },
  { name: "swiftmailer/swiftmailer", description: "Надсилання пошти для PHP", severity: "Критично", version: "6.3.0", latest: "—", updated: "4 роки тому", alternative: "symfony/mailer", alternativeNote: "офіційна наступниця для Symfony", risk: 87, ecosystem: "Packagist" },
  { name: "fzaninotto/faker", description: "Генератор тестових даних для PHP", severity: "Застаріло", version: "1.9.2", latest: "—", updated: "5 років тому", alternative: "fakerphp/faker", alternativeNote: "підтримуване продовження пакета", risk: 65, ecosystem: "Packagist" },
  { name: "therubyracer", description: "Вбудований рушій JavaScript для Ruby", severity: "Критично", version: "0.12.3", latest: "—", updated: "6 років тому", alternative: "mini_racer", alternativeNote: "сучасніший рушій для Ruby", risk: 84, ecosystem: "RubyGems" },
  { name: "System.Data.SqlClient", description: "Клієнт SQL Server для .NET", severity: "Застаріло", version: "4.8.6", latest: "—", updated: "—", alternative: "Microsoft.Data.SqlClient", alternativeNote: "рекомендований клієнт Microsoft", risk: 61, ecosystem: "NuGet" },
];

const rows = document.querySelector<HTMLTableSectionElement>("#dependency-rows")!;
const searchInput = document.querySelector<HTMLInputElement>("#search")!;
const emptyState = document.querySelector<HTMLDivElement>("#empty-state")!;
const resultCount = document.querySelector<HTMLSpanElement>("#result-count")!;
const toast = document.querySelector<HTMLDivElement>("#toast")!;
const fileInput = document.querySelector<HTMLInputElement>("#manifest-input")!;
const findingCount = document.querySelector<HTMLSpanElement>("#finding-count")!;
const totalPackages = document.querySelector<HTMLDivElement>("#total-packages")!;
const attentionPackages = document.querySelector<HTMLDivElement>("#attention-packages")!;
const attentionBreakdown = document.querySelector<HTMLDivElement>("#attention-breakdown")!;
const scanScope = document.querySelector<HTMLDivElement>("#scan-scope")!;
const scanFeedback = document.querySelector<HTMLDivElement>("#scan-feedback")!;
const authGate = document.querySelector<HTMLElement>("#auth-gate")!;
const appShell = document.querySelector<HTMLElement>(".app-shell")!;
const authFeedback = document.querySelector<HTMLParagraphElement>("#auth-feedback")!;
const guestStorageKey = "dependency-graveyard:guest-access";
let activeDependencies: Dependency[] = [];
let registryTargets: ScannedDependency[] = [];
const registrySnapshots = new Map<string, RegistrySnapshot>();
let auditHistory: AuditRecord[] = loadAuditHistory();
let currentAuditId: string | null = null;
let packageTotal = 0;
let demoMode = false;
let showingAll = false;
let sortByRisk = true;
let authSession: Session | null = null;
const requestedView = new URLSearchParams(window.location.search).get("view");
const appPage = requestedView === "app" || requestedView === "demo";
const demoPage = requestedView === "demo";

function hasGuestAccess(): boolean {
  try {
    return sessionStorage.getItem(guestStorageKey) === "true";
  } catch {
    return false;
  }
}

function setAuthFeedback(message: string): void {
  authFeedback.textContent = message;
  authFeedback.hidden = !message;
}

function showAuthGate(): void {
  document.body.classList.add("app-page", "auth-page");
  authGate.hidden = false;
  appShell.hidden = true;
}

function showAnalyzer(): void {
  document.body.classList.add("app-page");
  document.body.classList.remove("auth-page");
  authGate.hidden = true;
  appShell.hidden = false;
  const metadataName = authSession?.user.user_metadata?.full_name;
  const userName = (typeof metadataName === "string" && metadataName.trim()) || authSession?.user.email || "Гість";
  const avatar = userName.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("uk-UA") || "Г";
  document.querySelector<HTMLElement>(".project-switcher b")!.textContent = "Мій проєкт";
  document.querySelector<HTMLElement>(".breadcrumbs b")!.textContent = "Мій проєкт";
  document.querySelector<HTMLElement>(".profile .avatar")!.textContent = avatar;
  document.querySelector<HTMLElement>(".profile b")!.textContent = userName;
  document.querySelector<HTMLElement>(".profile small")!.textContent = authSession ? (authSession.user.email ?? "Обліковий запис") : "Гість · натисніть, щоб вийти";
  document.querySelector<HTMLButtonElement>("#profile-button")!.setAttribute("aria-label", authSession ? "Вийти з облікового запису" : "Завершити гостьовий сеанс");
  if (window.location.hash) requestAnimationFrame(() => document.querySelector(window.location.hash)?.scrollIntoView());
}

if (appPage || requestedView === "auth") document.body.classList.add("app-page");
if (demoPage) {
  document.body.classList.add("demo-page");
  appShell.hidden = false;
} else if (appPage && hasGuestAccess()) {
  showAnalyzer();
} else if (appPage || requestedView === "auth") {
  showAuthGate();
}

async function beginProviderSignIn(provider: Provider): Promise<void> {
  if (!supabase) {
    setAuthFeedback("Вхід через провайдери ще не налаштований у цьому розгортанні. Перевірте VITE_SUPABASE_URL і VITE_SUPABASE_ANON_KEY у Vercel або продовжте як гість.");
    return;
  }
  const providerNames: Record<string, string> = { google: "Google", github: "GitHub", gitlab: "GitLab" };
  const buttons = ["#auth-google", "#auth-github", "#auth-gitlab"].map((selector) => document.querySelector<HTMLButtonElement>(selector)!);
  buttons.forEach((button) => { button.disabled = true; });
  setAuthFeedback("Переходимо до " + (providerNames[provider] ?? provider) + " для входу…");
  const redirect = new URL(window.location.href);
  redirect.search = "?view=app";
  redirect.hash = "";
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirect.toString() },
    });
    if (!error) return;
    setAuthFeedback("Не вдалося розпочати вхід. Перевірте, чи провайдер увімкнений у Supabase, і спробуйте ще раз.");
  } catch {
    setAuthFeedback("Не вдалося з’єднатися з Supabase. Перевірте мережу й налаштування авторизації.");
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function initializeAuthFlow(): Promise<void> {
  if (!appPage || demoPage || hasGuestAccess()) return;
  if (!supabase) {
    setAuthFeedback("Для входу через Google, GitHub або GitLab потрібні VITE_SUPABASE_URL і VITE_SUPABASE_ANON_KEY у змінних середовища. Гостьовий режим доступний без них.");
    return;
  }
  supabase.auth.onAuthStateChange((_event, session) => {
    authSession = session;
    if (session) showAnalyzer();
    else if (appPage && !hasGuestAccess()) showAuthGate();
  });
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    setAuthFeedback("Не вдалося перевірити сеанс Supabase. Спробуйте знову або продовжте як гість.");
    return;
  }
  authSession = data.session;
  if (authSession) showAnalyzer();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function renderRecommendations(): void {
  const grid = document.querySelector<HTMLDivElement>("#recommendation-grid")!;
  const empty = document.querySelector<HTMLDivElement>("#recommendation-empty")!;
  const count = document.querySelector<HTMLSpanElement>("#recommendation-count")!;
  const items = activeDependencies.flatMap((dependency) => {
    const recommendation = getRecommendation(dependency);
    return recommendation ? [{ dependency, recommendation }] : [];
  });
  count.textContent = items.length + (items.length === 1 ? " рекомендація" : " рекомендацій");
  empty.hidden = items.length > 0;
  grid.replaceChildren();
  for (const { dependency, recommendation } of items) {
    const card = document.createElement("article");
    card.className = "recommendation-card";
    const top = document.createElement("div");
    top.className = "recommendation-package";
    const from = document.createElement("span");
    from.textContent = dependency.name + " · " + dependency.version;
    const arrow = document.createElement("span");
    arrow.className = "recommendation-arrow";
    arrow.textContent = "→";
    const to = document.createElement("strong");
    to.textContent = recommendation.target;
    top.append(from, arrow, to);
    const reason = document.createElement("p");
    reason.textContent = recommendation.reason;
    const migration = document.createElement("p");
    migration.className = "recommendation-migration";
    migration.textContent = "Перед переходом: " + recommendation.migration;
    const actions = document.createElement("div");
    actions.className = "recommendation-actions";
    if (recommendation.url) {
      const link = document.createElement("a");
      link.href = recommendation.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = recommendation.native ? "Документація ↗" : "Переглянути рішення ↗";
      actions.append(link);
    }
    if (recommendation.command) {
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "copy-command";
      copy.textContent = "Скопіювати команду";
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(recommendation.command!);
          showToast("Команду скопійовано. Переглянь її перед запуском.");
        } catch {
          showToast("Не вдалося скопіювати. Команда: " + recommendation.command);
        }
      });
      actions.append(copy);
    }
    card.append(top, reason, migration, actions);
    grid.append(card);
  }
}

function restoreAudit(record: AuditRecord): void {
  registryTargets = record.packages.map((item) => ({ ...item }));
  registrySnapshots.clear();
  activeDependencies = record.packages.flatMap((item) => {
    const known = dependencies.find((dependency) => packageKey(dependency) === packageKey(item));
    return known ? [{ ...known, version: item.version, ecosystem: item.ecosystem }] : [];
  });
  packageTotal = record.totalPackages;
  currentAuditId = record.id;
  showingAll = false;
  searchInput.value = "";
  document.querySelector<HTMLSelectElement>("#severity-filter")!.value = "Усі";
  const date = new Date(record.scannedAt).toLocaleString("uk-UA");
  scanScope.textContent = "Відновлено зі збереженого звіту · " + date;
  document.querySelector(".scan-time")!.textContent = "Збережений звіт · " + date;
  document.querySelector(".hero-kicker")!.textContent = "ІСТОРИЧНИЙ ЗВІТ · ЛОКАЛЬНІ ДАНІ";
  document.querySelector(".hero-index")!.textContent = "ІСТОРІЯ";
  document.querySelector(".hero-copy h2")!.innerHTML = activeDependencies.length
    ? activeDependencies.length + " із " + record.totalPackages + " пакетів<br /><span>потребують уваги.</span>"
    : record.totalPackages + " залежностей<br /><span>без збігів у каталозі.</span>";
  document.querySelector(".hero-copy p")!.textContent = "Звіт від " + date + ". Історія містить назви й версії пакетів, але не зберігає вміст маніфестів.";
  scanFeedback.textContent = "Відкрито аудит від " + date + ": " + record.totalPackages + " залежностей, " + record.findings + " збігів у локальному каталозі. Щоб отримати актуальні дані, запустіть онлайн-перевірки повторно.";
  scanFeedback.hidden = false;
  document.querySelector<HTMLElement>("#security-results")!.hidden = true;
  document.querySelector<HTMLDivElement>("#security-list")!.replaceChildren();
  renderRows();
  document.querySelector("#overview")?.scrollIntoView({ behavior: "smooth" });
  showToast("Збережений аудит відкрито.");
  renderHistory();
}

function renderHistory(): void {
  const list = document.querySelector<HTMLDivElement>("#history-list")!;
  const empty = document.querySelector<HTMLDivElement>("#history-empty")!;
  const count = document.querySelector<HTMLSpanElement>("#history-count")!;
  const clearButton = document.querySelector<HTMLButtonElement>("#clear-history-btn")!;
  list.replaceChildren();
  count.textContent = auditHistory.length + (auditHistory.length === 1 ? " звіт" : " звітів");
  document.querySelector("#history-nav-count")!.textContent = String(auditHistory.length);
  empty.hidden = auditHistory.length > 0;
  clearButton.hidden = auditHistory.length === 0;
  for (const record of auditHistory) {
    const card = document.createElement("article");
    card.className = "history-entry";
    const details = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = new Date(record.scannedAt).toLocaleString("uk-UA");
    const summary = document.createElement("p");
    summary.textContent = record.totalPackages + " залежностей · " + record.findings + " збігів каталогу · " + record.fileCount + " файлів · " + (record.ecosystems.join(", ") || "екосистеми не визначено");
    details.append(title, summary);
    const actions = document.createElement("div");
    actions.className = "history-entry-actions";
    if (record.comparedToPrevious) {
      const delta = document.createElement("p");
      delta.className = "history-diff";
      const names = (keys: string[]) => keys.slice(0, 4).map((key) => key.slice(key.indexOf(":") + 1)).join(", ") + (keys.length > 4 ? " та ще " + (keys.length - 4) : "");
      delta.textContent = "+" + record.newFindingKeys.length + " нових" + (record.newFindingKeys.length ? " (" + names(record.newFindingKeys) + ")" : "") + " · −" + record.resolvedFindingKeys.length + " більше не знайдено" + (record.resolvedFindingKeys.length ? " (" + names(record.resolvedFindingKeys) + ")" : "");
      details.append(delta);
    }
    const restoreButton = document.createElement("button");
    restoreButton.type = "button";
    restoreButton.textContent = currentAuditId === record.id ? "Відкрито" : "Відкрити звіт";
    restoreButton.disabled = currentAuditId === record.id;
    restoreButton.addEventListener("click", () => restoreAudit(record));
    actions.append(restoreButton);
    card.append(details, actions);
    list.append(card);
  }
}

function packageKey(item: Pick<ScannedDependency, 'name' | 'ecosystem'>): string {
  const name = item.ecosystem === 'PyPI' ? item.name.toLowerCase().replace(/[-_.]+/g, '-') : item.name.toLowerCase();
  return item.ecosystem.toLowerCase() + ':' + name;
}

function renderRows(): void {
  const query = searchInput.value.trim().toLowerCase();
  const severityFilter = (document.querySelector<HTMLSelectElement>("#severity-filter")?.value ?? "Усі") as Severity | "Усі";
  sortByRisk = document.querySelector<HTMLSelectElement>("#sort-button")?.value !== "name";
  const liveDependencies: Array<Dependency & { registryState?: string }> = activeDependencies.map((item) => {
    const snapshot = registrySnapshots.get(packageKey(item));
    if (!snapshot) return item;
    const isBehind = compareVersions(snapshot.latest, item.version) > 0;
    return { ...item, latest: snapshot.latest, updated: formatAge(snapshot.updatedAt) ?? item.updated, registryState: isBehind ? 'Є новіша версія' : 'Встановлена актуальна' };
  });
  const filtered = liveDependencies
    .filter((item) => severityFilter === "Усі" || item.severity === severityFilter)
    .filter((item) => `${item.name} ${item.description} ${item.alternative}`.toLowerCase().includes(query))
    .sort((a, b) => sortByRisk ? b.risk - a.risk : a.name.localeCompare(b.name));
  const shown = showingAll ? filtered : filtered.slice(0, 5);
  rows.innerHTML = shown.map((item) => `
    <tr>
      <td><div class="package-cell"><span class="package-icon ${item.name.startsWith("@") ? "icon-scope" : ""}">${escapeHtml(item.name.startsWith("@") ? "@" : item.name.slice(0, 1).toUpperCase())}</span><span><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.description)} · ${escapeHtml(item.ecosystem)}</small></span></div></td>
      <td><span class="status-pill ${item.severity === "Критично" ? "status-critical" : "status-stale"}"><i></i>${escapeHtml(item.severity)}</span></td>
      <td><span class="version">v${escapeHtml(item.version)}</span></td>
      <td><span class="version ${item.latest === "—" ? "version-unknown" : "version-latest"}">${item.latest === "—" ? "Невідома" : `v${escapeHtml(item.latest)}`}</span>${item.registryState ? `<small class="registry-check-state">${item.registryState}</small>` : ""}</td>
      <td><span class="updated-cell"><i></i>${escapeHtml(item.updated)}</span></td>
      <td><div class="alternative-cell"><b>${escapeHtml(item.alternative)}</b><small>${escapeHtml(item.alternativeNote)}</small></div></td>
      <td><div class="risk-cell" aria-label="Рівень уваги ${item.risk} зі 100"><div class="risk-track"><span class="${item.risk > 80 ? "risk-high" : item.risk > 55 ? "risk-mid" : "risk-low"}" style="width:${item.risk}%"></span></div><b>${item.risk}<small>/100</small></b></div></td>
      <td><button class="row-action" data-package="${escapeHtml(item.name)}" aria-label="Деталі ${escapeHtml(item.name)}">↗</button></td>
    </tr>`).join("");
  emptyState.hidden = shown.length > 0;
  resultCount.textContent = packageTotal === 0 ? "Поки немає результатів" : `Показано ${shown.length} із ${filtered.length} проблемних залежностей`;
  const showAllButton = document.querySelector<HTMLButtonElement>("#show-all-btn")!;
  showAllButton.hidden = filtered.length <= 5;
  showAllButton.textContent = showingAll ? "Згорнути список" : `Показати всі ${filtered.length}`;
  findingCount.textContent = String(activeDependencies.length);
  totalPackages.innerHTML = `${packageTotal} <span class="metric-unit">пакетів</span>`;
  attentionPackages.innerHTML = `${activeDependencies.length} <span class="metric-unit">пакетів</span>`;
  const criticalCount = activeDependencies.filter((item) => item.severity === "Критично").length;
  const staleCount = activeDependencies.length - criticalCount;
  attentionBreakdown.innerHTML = activeDependencies.length ? `<b class="text-amber">${criticalCount} критичних</b> · ${staleCount} застарілих` : "Немає результатів";
  document.querySelector("#nav-findings")!.textContent = String(activeDependencies.length);
  document.querySelector("#nav-total")!.textContent = String(packageTotal);
  document.querySelector("#rail-total")!.textContent = String(packageTotal);
  document.querySelector("#rail-findings")!.textContent = String(activeDependencies.length);
  document.querySelector("#rail-critical")!.textContent = String(criticalCount);
  document.querySelector("#rail-stale")!.textContent = String(staleCount);
  document.querySelector<HTMLElement>("#bundle-savings")!.innerHTML = demoMode ? '−184 <span class="metric-unit">кБ у бандлі</span>' : '<span class="metric-unit">—</span>';
  document.querySelector<HTMLElement>("#health-score")!.innerHTML = demoMode ? '72<span>/100</span>' : '—<span>/100</span>';
  rows.querySelectorAll<HTMLButtonElement>(".row-action").forEach((button) => {
    button.addEventListener("click", () => {
      const item = activeDependencies.find((dependency) => dependency.name === button.dataset.package)!;
      showToast(`${item.name}: ${item.alternative}. ${item.alternativeNote}.`);
    });
  });
  renderRecommendations();
}

let toastTimer: number | undefined;
function showToast(message: string): void {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3200);
}

searchInput.addEventListener("input", () => { showingAll = false; renderRows(); });
document.querySelector<HTMLSelectElement>("#severity-filter")?.addEventListener("change", () => { showingAll = false; renderRows(); });
document.querySelector<HTMLSelectElement>("#sort-button")?.addEventListener("change", renderRows);
document.querySelector("#show-all-btn")?.addEventListener("click", () => { showingAll = !showingAll; renderRows(); });
document.querySelector("#scan-btn")?.addEventListener("click", () => fileInput.click());
document.querySelector<HTMLButtonElement>("#registry-scan-btn")?.addEventListener("click", async (event) => {
  if (registryTargets.length === 0) {
    showToast("Спочатку завантажте маніфест залежностей.");
    return;
  }
  const registryButton = event.currentTarget as HTMLButtonElement;
  const registries: Record<string, string> = { npm: "npmjs.org", PyPI: "pypi.org", Maven: "Maven Central", Go: "proxy.golang.org", Cargo: "crates.io", Packagist: "Packagist", RubyGems: "RubyGems", NuGet: "NuGet" };
  const targetEcosystems = [...new Set(registryTargets.map((item) => item.ecosystem))];
  const knownRegistries = targetEcosystems.filter((ecosystem) => registries[ecosystem]);
  if (!knownRegistries.length) {
    showToast("Для цих екосистем немає підтримуваного публічного API реєстру.");
    return;
  }
  const approved = window.confirm(
    "Онлайн-перевірка надішле назви пакетів та встановлені версії з цього списку до відповідних публічних реєстрів: " +
    knownRegistries.map((ecosystem) => registries[ecosystem]).join(", ") +
    ". Вміст файлів і код не надсилаються. Приватні назви пакетів можуть розкрити інформацію про проєкт. Продовжити?",
  );
  if (!approved) return;

  registryButton.disabled = true;
  registryButton.textContent = "↻ Перевіряю…";
  let cursor = 0;
  let found = 0;
  let missing = 0;
  let failed = 0;
  const registryLines: string[] = [];
  const targets = registryTargets.filter((item) => registries[item.ecosystem]);
  const worker = async () => {
    while (cursor < targets.length) {
      const item = targets[cursor++];
      try {
        const snapshot = await lookupRegistry(item);
        if (snapshot) {
          registrySnapshots.set(packageKey(item), snapshot);
          found += 1;
          registryLines.push(item.name + " " + item.version + " → " + snapshot.latest + " · " + (formatAge(snapshot.updatedAt) ?? "дата публікації недоступна"));
        } else {
          missing += 1;
          registryLines.push(item.name + " — пакет не знайдено в доступному реєстрі");
        }
      } catch {
        failed += 1;
        registryLines.push(item.name + " — реєстр не відповів або заблокував запит");
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(4, targets.length) }, worker));
    renderRows();
    const unsupported = targetEcosystems.filter((ecosystem) => !registries[ecosystem]);
    const status = "Онлайн-дані: " + found + " пакетів оновлено · не знайдено: " + missing + " · помилки реєстру/мережі: " + failed + (unsupported.length ? " · без API: " + unsupported.join(", ") : ".");
    const details = registryLines.slice(0, 30).join("\n") + (registryLines.length > 30 ? "\n… і ще " + (registryLines.length - 30) + " пакетів" : "");
    scanFeedback.textContent = (scanFeedback.hidden ? "" : scanFeedback.textContent + "\n") + status + "\n" + details;
    scanFeedback.hidden = false;
    document.querySelector(".scan-time")!.innerHTML = "<i></i> Онлайн-дані щойно оновлено";
    showToast(status);
  } finally {
    registryButton.disabled = false;
    registryButton.textContent = "↻ Перевірити онлайн";
  }
});
document.querySelector<HTMLButtonElement>("#security-scan-btn")?.addEventListener("click", async (event) => {
  if (registryTargets.length === 0) {
    showToast("Спочатку завантажте маніфест залежностей.");
    return;
  }
  const securityButton = event.currentTarget as HTMLButtonElement;
  const supported = registryTargets.filter((item) => ['npm', 'PyPI', 'Maven', 'Go', 'Cargo', 'Packagist', 'RubyGems', 'NuGet'].includes(item.ecosystem) && item.version !== '—');
  if (!supported.length) {
    showToast("Немає пакетів із версіями, які підтримує OSV.");
    return;
  }
  if (!window.confirm("До OSV (api.osv.dev) буде надіслано назви пакетів, екосистеми та версії, зазначені у файлах, для перевірки відомих вразливостей. Файли й код не надсилаються. Якщо у маніфесті задано діапазон версій, а не lock-файл, результат може не відповідати фактично встановленій версії. Приватні назви пакетів можуть розкрити інформацію про проєкт. Продовжити?")) return;

  securityButton.disabled = true;
  securityButton.textContent = "⌕ Перевіряю…";
  const section = document.querySelector<HTMLElement>("#security-results")!;
  const summary = document.querySelector<HTMLParagraphElement>("#security-summary")!;
  const list = document.querySelector<HTMLDivElement>("#security-list")!;
  const count = document.querySelector<HTMLSpanElement>("#security-count")!;
  section.hidden = false;
  section.scrollIntoView({ behavior: "smooth", block: "nearest" });
  summary.classList.remove("security-error");
  summary.textContent = "Запитую базу OSV для " + supported.length + " версій пакетів…";
  list.replaceChildren();
  try {
    const { results, skipped } = await queryOsv(registryTargets);
    const affected = results.filter((item) => item.vulnerabilities.length > 0);
    const findingTotal = results.reduce((total, item) => total + item.vulnerabilities.length, 0);
    count.textContent = String(findingTotal);
    summary.textContent = results.length + " версій перевірено. Знайдено " + findingTotal + " записів про вразливості у " + affected.length + " пакетах." + (skipped ? " Пропущено без точної версії або підтримки OSV: " + skipped + "." : "") + " Відсутність збігів не гарантує безпеку пакета.";
    if (!findingTotal) {
      const empty = document.createElement("div");
      empty.className = "security-ok";
      empty.textContent = "OSV не повернув відомих advisories для перевірених версій. Це не є гарантією безпеки.";
      list.append(empty);
    }
    for (const item of affected) {
      for (const advisory of item.vulnerabilities) {
        const card = document.createElement("article");
        card.className = "security-item";
        const copy = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = item.name + " " + item.version + " · " + advisory.id;
        const description = document.createElement("p");
        description.textContent = advisory.summary || advisory.details?.slice(0, 220) || "OSV повідомляє про відому вразливість для цієї версії.";
        copy.append(title, description);
        const link = document.createElement("a");
        link.href = "https://osv.dev/vulnerability/" + encodeURIComponent(advisory.id);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Деталі ↗";
        link.setAttribute("aria-label", "Відкрити advisory " + advisory.id + " на osv.dev");
        card.append(copy, link);
        list.append(card);
      }
    }
    if (skipped) {
      const note = document.createElement("p");
      note.className = "security-summary";
      note.textContent = "Підтримуються npm, PyPI, Maven, Go, crates.io, Packagist, RubyGems і NuGet. Для повної точності використовуйте lock-файл: версія з package.json або іншого маніфесту може бути лише діапазоном.";
      list.append(note);
    }
  } catch (error) {
    count.textContent = "!";
    summary.classList.add("security-error");
    summary.textContent = error instanceof Error ? error.message + ". Перевірте мережу й повторіть запит." : "Не вдалося отримати дані OSV. Перевірте мережу й повторіть запит.";
  } finally {
    securityButton.disabled = false;
    securityButton.textContent = "⌕ Вразливості";
  }
});

const toolsToggle = document.querySelector<HTMLButtonElement>("#site-tools-toggle")!;
const toolsPanel = document.querySelector<HTMLElement>("#site-tools-panel")!;
function openDemoReport(): void {
  demoMode = true;
  activeDependencies = [...dependencies];
  registryTargets = dependencies.map(({ name, version, ecosystem }) => ({ name, version, ecosystem }));
  registrySnapshots.clear();
  packageTotal = 48;
  showingAll = false;
  searchInput.value = "";
  document.querySelector<HTMLSelectElement>("#severity-filter")!.value = "Усі";
  document.querySelector("#demo-preview")!.removeAttribute("hidden");
  document.querySelector("#demo-insight-card")!.removeAttribute("hidden");
  document.querySelector(".scan-time")!.innerHTML = "<i></i> Демонстраційні дані";
  scanScope.textContent = "У демо-проєкті";
  scanFeedback.hidden = true;
  renderRows();
  document.querySelector("#overview")?.scrollIntoView({ behavior: "smooth" });
}
function setToolsPanelOpen(open: boolean): void {
  toolsPanel.hidden = !open;
  toolsToggle.setAttribute("aria-expanded", String(open));
  if (open) document.querySelector<HTMLButtonElement>("#quick-panel-close")?.focus();
}
toolsToggle.addEventListener("click", () => setToolsPanelOpen(toolsPanel.hidden));
document.querySelector("#quick-panel-close")?.addEventListener("click", () => {
  setToolsPanelOpen(false);
  toolsToggle.focus();
});
document.querySelector<HTMLButtonElement>("#auth-google")?.addEventListener("click", () => { void beginProviderSignIn("google"); });
document.querySelector<HTMLButtonElement>("#auth-github")?.addEventListener("click", () => { void beginProviderSignIn("github"); });
document.querySelector<HTMLButtonElement>("#auth-gitlab")?.addEventListener("click", () => { void beginProviderSignIn("gitlab"); });
document.querySelector<HTMLButtonElement>("#auth-guest")?.addEventListener("click", () => {
  try {
    sessionStorage.setItem(guestStorageKey, "true");
  } catch {
    setAuthFeedback("Браузер не зберіг гостьовий сеанс. Аналізатор відкриється зараз, але після перезавантаження знадобиться повторний вибір.");
  }
  showAnalyzer();
});
document.querySelector("#landing-open-tools")?.addEventListener("click", () => setToolsPanelOpen(true));
document.querySelector("#landing-panel")?.addEventListener("click", () => setToolsPanelOpen(true));
toolsPanel.querySelectorAll<HTMLAnchorElement>("a").forEach((link) => link.addEventListener("click", () => setToolsPanelOpen(false)));
document.addEventListener("click", (event) => {
  if (!toolsPanel.hidden && event.target instanceof Node && !toolsPanel.contains(event.target) && !toolsToggle.contains(event.target)) setToolsPanelOpen(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !toolsPanel.hidden) {
    setToolsPanelOpen(false);
    toolsToggle.focus();
  }
});
fileInput.addEventListener("change", async () => {
  const files = [...(fileInput.files ?? [])];
  if (files.length === 0) return;

  type FileResult = {
    fileName: string;
    info: ManifestInfo | null;
    status: "read" | "empty" | "unsupported" | "error";
    dependencies: ScannedDependency[];
    message?: string;
  };

  const fileResults: FileResult[] = await Promise.all(files.map(async (file): Promise<FileResult> => {
    const info = detectManifest(file.name);
    if (!info) return { fileName: file.name, info: null, status: "unsupported", dependencies: [], message: "формат не підтримується" };
    try {
      const parsed = parseManifest(file.name, await file.text());
      return { fileName: file.name, info, status: parsed.length ? "read" : "empty", dependencies: parsed };
    } catch (error) {
      return { fileName: file.name, info, status: "error", dependencies: [], message: error instanceof Error ? error.message : "не вдалося прочитати файл" };
    }
  }));

  const parsed = fileResults.flatMap((result) => result.dependencies);
  const normalizedName = (item: ScannedDependency) => item.ecosystem === "PyPI" ? item.name.toLowerCase().replace(/[-_.]+/g, "-") : item.name.toLowerCase();
  const lockedFile = (fileName: string) => /(?:\\.lock|package-lock|npm-shrinkwrap)/i.test(fileName);
  const uniquePackages = new Map<string, { dependency: ScannedDependency; locked: boolean }>();
  for (const result of fileResults) {
    for (const item of result.dependencies) {
      const key = item.ecosystem.toLowerCase() + ":" + normalizedName(item);
      const locked = lockedFile(result.fileName);
      const existing = uniquePackages.get(key);
      if (!existing || (locked && !existing.locked)) uniquePackages.set(key, { dependency: item, locked });
    }
  }

  const catalog = new Map(dependencies.map((item) => {
    const normalized = item.ecosystem === "PyPI" ? item.name.toLowerCase().replace(/[-_.]+/g, "-") : item.name.toLowerCase();
    return [item.ecosystem.toLowerCase() + ":" + normalized, item];
  }));
  const scanned = [...uniquePackages.values()].map((entry) => entry.dependency);
  demoMode = false;
  document.querySelector<HTMLElement>("#demo-preview")!.hidden = true;
  document.querySelector<HTMLElement>("#demo-insight-card")!.hidden = true;
  registryTargets = scanned;
  registrySnapshots.clear();
  document.querySelector<HTMLElement>("#security-results")!.hidden = true;
  document.querySelector<HTMLDivElement>("#security-list")!.replaceChildren();
  document.querySelector<HTMLSpanElement>("#security-count")!.textContent = "0";
  document.querySelector<HTMLParagraphElement>("#security-summary")!.classList.remove("security-error");
  activeDependencies = scanned.flatMap((item) => {
    const known = catalog.get(item.ecosystem.toLowerCase() + ":" + normalizedName(item));
    return known ? [{ ...known, version: item.version, ecosystem: item.ecosystem }] : [];
  });
  packageTotal = scanned.length;
  showingAll = false;
  searchInput.value = "";
  document.querySelector<HTMLSelectElement>("#severity-filter")!.value = "Усі";

  const recognizedFiles = fileResults.filter((result) => result.status === "read" || result.status === "empty").length;
  const historyRecord = createAuditRecord(scanned, activeDependencies, files.length, auditHistory[0]);
  const historyWrite = saveAuditHistory(historyRecord);
  auditHistory = historyWrite.records;
  currentAuditId = historyRecord.id;
  renderHistory();
  scanScope.textContent = recognizedFiles + " із " + files.length + " файлів розпізнано";
  document.querySelector(".scan-time")!.textContent = historyWrite.saved ? "Сканування збережено локально" : "Сканування виконано · історію не збережено";
  document.querySelector(".hero-kicker")!.textContent = "РЕЗУЛЬТАТИ ЛОКАЛЬНОЇ ПЕРЕВІРКИ";
  document.querySelector(".hero-copy h2")!.innerHTML = activeDependencies.length
    ? activeDependencies.length + " із " + scanned.length + " пакетів<br /><span>потребують уваги.</span>"
    : scanned.length + " залежностей<br /><span>без збігів у каталозі.</span>";
  const unmatched = scanned.filter((item) => !catalog.has(item.ecosystem.toLowerCase() + ":" + normalizedName(item)));
  document.querySelector(".hero-copy p")!.textContent = "Зіставлено з локальним каталогом: " + activeDependencies.length + " збігів. " + unmatched.length + " залежностей не мають запису в каталозі — це не означає, що вони безпечні.";

  const fileLines = fileResults.map((result) => {
    if (result.status === "read") return result.fileName + " — " + result.dependencies.length + " залежностей · " + result.info?.format;
    if (result.status === "empty") return result.fileName + " — формат розпізнано, залежностей не знайдено";
    return result.fileName + " — " + result.message;
  });
  const unmatchedNames = [...new Set(unmatched.map((item) => item.name))];
  const unmatchedSummary = unmatchedNames.length
    ? "Без запису в каталозі (" + unmatchedNames.length + "): " + unmatchedNames.slice(0, 12).join(", ") + (unmatchedNames.length > 12 ? " та ще " + (unmatchedNames.length - 12) : "") + "."
    : "Усі розпізнані залежності є у локальному каталозі.";
  const ecosystems = [...new Set(scanned.map((item) => item.ecosystem))].join(", ");
  const duplicateCount = parsed.length - scanned.length;
  const hasUnsupportedFiles = fileResults.some((result) => result.status === "error" || result.status === "unsupported");
  scanFeedback.textContent = [
    "Файли: " + recognizedFiles + " із " + files.length + " розпізнано · залежності: " + parsed.length + " · унікальні: " + scanned.length + " · дублікати: " + duplicateCount + ".",
    "Екосистеми: " + (ecosystems || "не визначено") + " · збіги каталогу: " + activeDependencies.length + ".",
    historyRecord.comparedToPrevious ? "Порівняння з попереднім аудитом: +" + historyRecord.newFindingKeys.length + " нових збігів · −" + historyRecord.resolvedFindingKeys.length + " більше не знайдено." : "Це перший збережений аудит — наступне сканування можна буде порівняти з ним.",
    unmatchedSummary,
    ...fileLines,
    ...(hasUnsupportedFiles ? ["Підтримувані формати: " + supportedManifests + "."] : []),
  ].join("\n");
  scanFeedback.hidden = false;
  emptyState.textContent = "Збігів у локальному каталозі немає. Невідомі пакети не перевіряються на актуальність.";
  renderRows();
  document.querySelector("#overview")?.scrollIntoView({ behavior: "smooth" });

  const issueFiles = fileResults.filter((result) => result.status === "error" || result.status === "unsupported").length;
  showToast("Перевірено " + recognizedFiles + " із " + files.length + " файлів та " + scanned.length + " залежностей; збігів у каталозі: " + activeDependencies.length + (issueFiles ? "; файлів з помилками або невідомим форматом: " + issueFiles : "") + ".");
  if (!historyWrite.saved) showToast("Сканування готове, але браузер не зміг зберегти історію. Перевірте доступне місце для локальних даних.");
  fileInput.value = "";
});document.querySelector("#review-btn")?.addEventListener("click", () => document.querySelector("#dependencies")?.scrollIntoView({ behavior: "smooth" }));
document.querySelector("#insight-btn")?.addEventListener("click", () => {
  if (!activeDependencies.some((item) => item.name === "moment")) {
    showToast("Ця порада є частиною демо-звіту. Завантажте свій маніфест, щоб побачити збіги.");
    return;
  }
  document.querySelector("#dependencies")?.scrollIntoView({ behavior: "smooth" });
  searchInput.value = "moment";
  renderRows();
});
document.querySelector("#export-btn")?.addEventListener("click", () => {
  const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const report = [["Мова", "Пакет", "Проблема", "Встановлена версія", "Остання версія", "Останнє оновлення", "Рекомендована заміна", "Причина", "Крок міграції", "Команда для ручного запуску", "Рівень уваги"], ...activeDependencies.map((d) => {
    const recommendation = getRecommendation(d);
    const registry = registrySnapshots.get(packageKey(d));
    return [d.ecosystem, d.name, d.severity, d.version, registry?.latest ?? d.latest, formatAge(registry?.updatedAt) ?? d.updated, recommendation?.target ?? d.alternative, recommendation?.reason ?? "Рекомендації немає", recommendation?.migration ?? "", recommendation?.command ?? "", d.risk];
  })].map((line) => line.map(csvCell).join(",")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([report], { type: "text/csv;charset=utf-8" }));
  link.download = "dependency-graveyard-report.csv";
  link.click();
  URL.revokeObjectURL(link.href);
});

document.querySelector("#notify-button")?.addEventListener("click", () => showToast("Нових сповіщень немає."));
document.querySelector<HTMLButtonElement>("#clear-history-btn")?.addEventListener("click", () => {
  if (!window.confirm("Видалити всі збережені локальні звіти? Цю дію не можна скасувати.")) return;
  if (!removeAuditHistory()) {
    showToast("Браузер не дозволив очистити локальну історію.");
    return;
  }
  auditHistory = [];
  currentAuditId = null;
  renderHistory();
  showToast("Історію очищено.");
});
document.querySelector("#project-switcher")?.addEventListener("click", () => showToast(demoPage ? "Зараз відкритий демо-проєкт studio-dashboard." : "Результати аналізу зберігаються локально у цьому браузері."));
document.querySelector<HTMLButtonElement>("#profile-button")?.addEventListener("click", async () => {
  if (demoPage) {
    showToast("Це демонстраційний профіль Dependency Graveyard.");
    return;
  }
  if (authSession && supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) {
      showToast("Не вдалося завершити сеанс Supabase. Спробуйте ще раз.");
      return;
    }
  }
  try { sessionStorage.removeItem(guestStorageKey); } catch { /* The next page load will ask for access again. */ }
  window.location.assign("./?view=app");
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput.focus();
  }
});

renderRows();
renderHistory();
if (demoPage) openDemoReport();
else if (appPage) void initializeAuthFlow();
