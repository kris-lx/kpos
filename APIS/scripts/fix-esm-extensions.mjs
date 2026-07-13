// ═══════════════════════════════════════════════════════════════════════════
// Post-build step: adds explicit .js extensions to relative import/export
// specifiers in the compiled dist/ output.
//
// Why this exists: tsconfig.json uses moduleResolution "bundler" (needed for
// path-alias support and tsx's dev-time resolution), which does not require
// or add .js extensions to relative specifiers. Plain Node ESM
// (`node dist/index.js`, no bundler) requires them. tsc-alias (run before
// this script) already rewrites `@/...`-style aliases to relative paths
// *with* extensions; this script covers the remaining plain relative
// specifiers (`./foo`, `../bar`) that were already relative in source and so
// tsc-alias leaves untouched.
//
// Operates only on dist/**/*.js — never touches source. Safe to re-run.
// ═══════════════════════════════════════════════════════════════════════════

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '..', 'dist');

const SPECIFIER_RE = /(\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(['"])(\.[^'"]*)\2/g;
const EXPORT_RE = /(\bexport\s+[^'";]*?\s+from\s+)(['"])(\.[^'"]*)\2/g;

function resolveSpecifier(fileDir, spec) {
    if (/\.(js|mjs|cjs|json|node)$/.test(spec)) return spec;

    const asFile = resolve(fileDir, `${spec}.js`);
    if (existsSync(asFile)) return `${spec}.js`;

    const asIndex = resolve(fileDir, spec, 'index.js');
    if (existsSync(asIndex)) return `${spec}/index.js`;

    // Fallback: assume it's a file even if not found (shouldn't happen for a
    // clean build), so we don't silently leave it unresolved.
    return `${spec}.js`;
}

function fixFile(filePath) {
    const fileDir = dirname(filePath);
    let content = readFileSync(filePath, 'utf8');
    let changed = false;

    const rewrite = (_match, prefix, quote, spec) => {
        const fixed = resolveSpecifier(fileDir, spec);
        if (fixed !== spec) changed = true;
        return `${prefix}${quote}${fixed}${quote}`;
    };

    content = content.replace(SPECIFIER_RE, rewrite);
    content = content.replace(EXPORT_RE, rewrite);

    if (changed) {
        writeFileSync(filePath, content, 'utf8');
    }
    return changed;
}

function walk(dir) {
    let count = 0;
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
            count += walk(full);
        } else if (entry.endsWith('.js')) {
            if (fixFile(full)) count++;
        }
    }
    return count;
}

if (!existsSync(distDir)) {
    console.error(`❌ fix-esm-extensions: dist/ not found at ${distDir}`);
    process.exit(1);
}

const fixedCount = walk(distDir);
console.log(`✅ fix-esm-extensions: rewrote relative import/export specifiers in ${fixedCount} file(s)`);
