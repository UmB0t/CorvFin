const { execSync } = require('node:child_process');
const path = require('node:path');

console.log('Generating CorvFin official PWA icons from corvfin-logo-compact.png...');
const pyScript = path.join(__dirname, 'generate_corvfin_icons.py');
execSync(`python "${pyScript}"`, { stdio: 'inherit' });
console.log('All CorvFin icons generated successfully!');
