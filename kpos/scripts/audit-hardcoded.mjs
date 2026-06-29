import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd().replace(/\\/g, '/');
const scanRoots = [
  join(process.cwd(), 'src'),
  join(process.cwd(), '..', 'APIS', 'src'),
];

const allowedPathParts = [
  '/src/lib/i18n/locales/',
  '/src/db/seed-demo.ts',
  '/src/db/seed-reset.ts',
  '.test.ts',
  '.spec.ts',
];

const hardcodedTextPattern = /[ກ-ຮ]/;
const unsafeDataPattern =
  /\b(mock|dummy|fake|hardcoded|fall back to hardcoded|fallbackPermissions|KPOS Demo Store|Sample Product|Another Item)\b/i;
const unsafeTranslationFallbackPattern = /t\([^\r\n]+\)\s*\|\|/;
const strictTranslationFallbackPattern = /t\([^\r\n()]+\)\s*\|\|\s*(['"`])/;

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.svelte-kit' || entry.name === 'dist') continue;
      files.push(...walk(path));
    } else if (/\.(svelte|ts)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

function isAllowed(path) {
  const normalized = path.replace(/\\/g, '/');
  return allowedPathParts.some((part) => normalized.includes(part));
}

const findings = [];

for (const scanRoot of scanRoots) {
  try {
    statSync(scanRoot);
  } catch {
    continue;
  }

  for (const file of walk(scanRoot)) {
    if (isAllowed(file)) continue;
    const rel = relative(root, file).replace(/\\/g, '/');
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) return;

      const issues = [];
      if (hardcodedTextPattern.test(line)) issues.push('hardcoded visible Lao text');
      if (strictTranslationFallbackPattern.test(line) || unsafeTranslationFallbackPattern.test(line) && /['"`]/.test(line.split('||')[1] || '')) {
        issues.push('translation fallback text');
      }
      if (unsafeDataPattern.test(line)) issues.push('mock/fallback/static data marker');

      if (issues.length > 0) {
        findings.push(`${rel}:${index + 1} ${issues.join(', ')}`);
      }
    });
  }
}

if (findings.length > 0) {
  console.error(`Hardcoded/mock audit failed: ${findings.length} finding(s).\n`);
  for (const finding of findings.slice(0, 200)) {
    console.error(finding);
  }
  if (findings.length > 200) {
    console.error(`...and ${findings.length - 200} more.`);
  }
  process.exit(1);
}

console.log('Hardcoded/mock audit passed.');
