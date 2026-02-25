import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

const results = [];

function run(label, cmd, cwd) {
    try {
        const out = execSync(cmd, { encoding: 'utf8', cwd, timeout: 30000 });
        results.push(`=== ${label} ===\n${out.trim()}\n`);
    } catch (e) {
        results.push(`=== ${label} (ERROR) ===\n${e.stderr || e.message}\n`);
    }
}

run('Docker version', 'docker --version');
run('Docker containers', 'docker ps -a');
run('Docker compose ps', 'docker compose ps', 'D:\\Project\\pos\\POS');

writeFileSync('D:\\Project\\pos\\POS\\APIS\\_check_result.txt', results.join('\n'), 'utf8');
console.log('Done - check _check_result.txt');
