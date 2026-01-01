const fs = require('fs');
const vm = require('vm');

try {
  const code = fs.readFileSync('app-beta.js', 'utf8');
  // Just parsing, not executing, to check for syntax errors.
  // We wrap it in a function to avoid global scope pollution if we were executing,
  // but mostly to allow top-level returns if any (though not expected in this file).
  new vm.Script(code);
  console.log('Syntax check passed for app-beta.js');
} catch (e) {
  console.error('Syntax check failed:', e);
  process.exit(1);
}
