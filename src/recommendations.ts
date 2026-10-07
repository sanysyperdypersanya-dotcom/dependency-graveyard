import type { ScannedDependency } from './parsers';

export type Recommendation = {
  target: string;
  reason: string;
  migration: string;
  command?: string;
  url?: string;
  native?: boolean;
};

const recommendations: Record<string, Recommendation> = {
  'npm:moment': { target: 'date-fns', reason: 'Модульний API дозволяє підключати лише потрібні функції.', migration: 'Перевірте токени форматування дат: вони відрізняються від Moment.js.', command: 'npm install date-fns', url: 'https://www.npmjs.com/package/date-fns' },
  'npm:request': { target: 'undici / вбудований fetch', reason: 'Request більше не підтримується; сучасний Node.js має стандартний fetch.', migration: 'Оновіть обробку помилок, заголовків і потоків у викликах HTTP.', url: 'https://nodejs.org/api/globals.html#fetch' },
  'npm:lodash': { target: 'es-toolkit', reason: 'Сучасна модульна бібліотека з утилітами для типових операцій.', migration: 'Перевірте сумісність функцій і крайових випадків перед заміною імпортів.', command: 'npm install es-toolkit', url: 'https://www.npmjs.com/package/es-toolkit' },
  'npm:core-js': { target: 'core-js 3.x', reason: 'Перейдіть на актуальну гілку того самого проєкту.', migration: 'Перевірте browserslist і конфігурацію Babel перед оновленням.', command: 'npm install core-js@latest', url: 'https://www.npmjs.com/package/core-js' },
  'npm:uuid': { target: 'crypto.randomUUID()', reason: 'Для створення UUID v4 у сучасних браузерах і Node.js є вбудований API.', migration: 'Перевірте цільові середовища; для старих середовищ залиште сумісну бібліотеку.', native: true, url: 'https://developer.mozilla.org/docs/Web/API/Crypto/randomUUID' },
  'npm:node-sass': { target: 'sass', reason: 'Dart Sass є актуальною реалізацією Sass.', migration: 'Звірте зміни синтаксису та нативних залежностей у вашій збірці.', command: 'npm uninstall node-sass && npm install sass', url: 'https://www.npmjs.com/package/sass' },
  'npm:webpack': { target: 'Vite', reason: 'Сучасна збірка з швидким dev-сервером; міграція залежить від конфігурації проєкту.', migration: 'Перенесіть entry points, plugins, aliases та environment variables.', command: 'npm install -D vite', url: 'https://vite.dev/guide/' },
  'npm:request-promise': { target: 'fetch', reason: 'Стандартний API платформи не потребує додаткової бібліотеки.', migration: 'Замініть Promise-ланцюжки та додайте явну перевірку response.ok.', native: true, url: 'https://developer.mozilla.org/docs/Web/API/Fetch_API' },
  'npm:babel-eslint': { target: '@babel/eslint-parser', reason: 'Підтримуваний Babel парсер для ESLint.', migration: 'Оновіть parser і parserOptions в конфігурації ESLint.', command: 'npm install -D @babel/eslint-parser', url: 'https://www.npmjs.com/package/@babel/eslint-parser' },
  'npm:left-pad': { target: 'String.prototype.padStart()', reason: 'Вбудований метод JavaScript замінює доповнення рядка зліва.', migration: 'Замініть leftPad(value, length, fill) на String(value).padStart(length, fill).', native: true, url: 'https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String/padStart' },
  'npm:gulp-util': { target: 'Спеціалізовані пакети Gulp', reason: 'Єдиного drop-in replacement немає: функції рознесені по окремих пакетах.', migration: 'Знайдіть використання gulp-util і підберіть пакет окремо для кожного API.', url: 'https://www.npmjs.com/package/gulp-util' },
  'npm:tslint': { target: 'ESLint + typescript-eslint', reason: 'TSLint застарів; typescript-eslint підтримує перевірки TypeScript в ESLint.', migration: 'Перенесіть правила конфігурації та перевірте зміни поведінки правил.', command: 'npm install -D eslint typescript typescript-eslint', url: 'https://typescript-eslint.io/getting-started/' },
  'pypi:nose': { target: 'pytest', reason: 'Активний тестовий фреймворк із широкою екосистемою плагінів.', migration: 'Почніть із запуску pytest; за потреби замініть nose-specific fixtures і plugins.', command: 'python -m pip install pytest', url: 'https://docs.pytest.org/' },
  'maven:log4j:log4j': { target: 'org.apache.logging.log4j:log4j-core', reason: 'Сучасна гілка Log4j 2 від Apache.', migration: 'Оновіть координати, конфігурацію та API логування; перевірте сумісність транзитивних залежностей.', url: 'https://logging.apache.org/log4j/2.x/' },
  'go:github.com/dgrijalva/jwt-go': { target: 'github.com/golang-jwt/jwt/v5', reason: 'Підтримуваний форк проєкту з актуальною гілкою API.', migration: 'Перевірте breaking changes між основними версіями та імпорти.', command: 'go get github.com/golang-jwt/jwt/v5', url: 'https://pkg.go.dev/github.com/golang-jwt/jwt/v5' },
  'go:github.com/satori/go.uuid': { target: 'github.com/google/uuid', reason: 'Підтримувана бібліотека UUID для Go.', migration: 'Перевірте типи UUID і помилки в місцях генерації та парсингу.', command: 'go get github.com/google/uuid', url: 'https://pkg.go.dev/github.com/google/uuid' },
  'cargo:failure': { target: 'anyhow або thiserror', reason: 'Поширені інструменти для прикладних помилок або типізованих помилок бібліотеки.', migration: 'Оберіть anyhow для застосунку або thiserror для власних типів помилок.', url: 'https://doc.rust-lang.org/book/ch09-00-error-handling.html' },
  'cargo:ansi_term': { target: 'owo-colors', reason: 'Активна бібліотека кольорового термінального виводу.', migration: 'Перевірте доступні стилі та вимкнення кольорів у non-TTY середовищах.', command: 'cargo add owo-colors', url: 'https://crates.io/crates/owo-colors' },
  'packagist:swiftmailer/swiftmailer': { target: 'symfony/mailer', reason: 'Рекомендована заміна в екосистемі Symfony.', migration: 'Оновіть транспорт, конфігурацію та виклики відправлення листів.', command: 'composer require symfony/mailer', url: 'https://packagist.org/packages/symfony/mailer' },
  'packagist:fzaninotto/faker': { target: 'fakerphp/faker', reason: 'Підтримуване продовження Faker для PHP.', migration: 'Перевірте namespace та сумісність версії PHP.', command: 'composer require fakerphp/faker', url: 'https://packagist.org/packages/fakerphp/faker' },
  'rubygems:therubyracer': { target: 'mini_racer', reason: 'Сучасніший V8 engine для Ruby-проєктів.', migration: 'Перевірте вимоги до Ruby, нативних інструментів і місця виконання JavaScript.', command: 'bundle add mini_racer', url: 'https://rubygems.org/gems/mini_racer' },
  'nuget:system.data.sqlclient': { target: 'Microsoft.Data.SqlClient', reason: 'Актуальний SQL Server provider від Microsoft.', migration: 'Перевірте зміни namespace, параметрів підключення та поведінки драйвера.', command: 'dotnet add package Microsoft.Data.SqlClient', url: 'https://www.nuget.org/packages/Microsoft.Data.SqlClient' },
};

export function getRecommendation(item: ScannedDependency): Recommendation | undefined {
  const normalized = item.ecosystem === 'PyPI' ? item.name.toLowerCase().replace(/[-_.]+/g, '-') : item.name.toLowerCase();
  return recommendations[item.ecosystem.toLowerCase() + ':' + normalized];
}
