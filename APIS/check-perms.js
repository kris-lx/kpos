const fs = require('fs');
const path = require('path');

try {

const dir = path.join(__dirname, 'src', 'modules');
const perms = new Set();

function walk(d) {
  fs.readdirSync(d).forEach(f => {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f === 'routes.ts') {
      const c = fs.readFileSync(p, 'utf8');
      const rx = /authorize\('([^']+)'\)/g;
      let m;
      while ((m = rx.exec(c))) perms.add(m[1]);
    }
  });
}
walk(dir);

// Read ALL_PERMISSIONS from roles routes
const rolesFile = fs.readFileSync(path.join(dir, 'roles', 'presentation', 'routes.ts'), 'utf8');
const allPermsMatch = rolesFile.match(/const ALL_PERMISSIONS = \[([\s\S]*?)\];/);
const allPerms = [];
if (allPermsMatch) {
  const rx2 = /'([^']+)'/g;
  let m2;
  while ((m2 = rx2.exec(allPermsMatch[1]))) allPerms.push(m2[1]);
}

const usedPerms = [...perms].sort();
console.log('=== Permissions used in authorize() but NOT in ALL_PERMISSIONS ===');
usedPerms.forEach(p => {
  if (!allPerms.includes(p)) console.log('  MISSING:', p);
});

console.log('\n=== Permissions in ALL_PERMISSIONS but never used in authorize() ===');
allPerms.forEach(p => {
  if (!perms.has(p)) console.log('  UNUSED:', p);
});

console.log('\nTotal authorize perms:', usedPerms.length);
console.log('Total ALL_PERMISSIONS:', allPerms.length);

// Also write to file
const lines = [];
lines.push('=== Permissions used in authorize() but NOT in ALL_PERMISSIONS ===');
usedPerms.forEach(p => {
  if (!allPerms.includes(p)) lines.push('  MISSING: ' + p);
});
lines.push('');
lines.push('=== Permissions in ALL_PERMISSIONS but never used in authorize() ===');
allPerms.forEach(p => {
  if (!perms.has(p)) lines.push('  UNUSED: ' + p);
});
lines.push('');
lines.push('Total authorize perms: ' + usedPerms.length);
lines.push('Total ALL_PERMISSIONS: ' + allPerms.length);
lines.push('');
lines.push('=== All authorize() permissions ===');
usedPerms.forEach(p => lines.push('  ' + p));
fs.writeFileSync(path.join(__dirname, 'perms-report.txt'), lines.join('\n'));
