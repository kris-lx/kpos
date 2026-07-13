// ═══════════════════════════════════════════════════════════════════════════
// Build orchestrator — replaces a shell-operator chain
// (`tsc ... || exit 0 && tsc-alias && node ...`) that turned out to behave
// differently depending on which shell `npm run` picks (bash vs Windows
// cmd.exe — npm defaults to cmd.exe on win32 regardless of the invoking
// terminal), silently no-op'ing under cmd.exe. Node's child_process is the
// same on every platform, so orchestrating here removes the ambiguity.
//
// Step 1 (tsc) is allowed to exit non-zero — `--noEmitOnError false` means it
// still emits output despite type errors, so the build continues; a caller
// who cares about type errors should run `npm run typecheck` separately (CI
// does).
// ═══════════════════════════════════════════════════════════════════════════

import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';

function run(cmd, { allowFailure = false } = {}) {
    console.log(`$ ${cmd}`);
    try {
        execSync(cmd, { stdio: 'inherit' });
    } catch (err) {
        if (!allowFailure) throw err;
    }
}

if (process.argv.includes('--clean')) {
    console.log('$ rm -rf dist');
    rmSync('dist', { recursive: true, force: true });
}

run('npx tsc --noEmitOnError false', { allowFailure: true });
run('npx tsc-alias -p tsconfig.json');
run('node scripts/fix-esm-extensions.mjs');
