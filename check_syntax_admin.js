const fs = require('fs');
const vm = require('vm');

try {
  const code = fs.readFileSync('app-admin.js', 'utf8');
  new vm.Script(code);
  console.log('Syntax check passed for app-admin.js');
} catch (e) {
  console.error('Syntax check failed:', e);
  process.exit(1);
}
