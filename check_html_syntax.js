const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// Extract all <script> contents
const regex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let count = 0;
while ((match = regex.exec(html)) !== null) {
  if (match[1].trim()) {
    fs.writeFileSync(`temp_script_${count}.js`, match[1]);
    console.log(`Checking script ${count}...`);
    require('child_process').execSync(`node --check temp_script_${count}.js`);
    count++;
  }
}
console.log('Done checking HTML scripts.');
