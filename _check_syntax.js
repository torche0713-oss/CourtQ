const fs = require('fs');
const html = fs.readFileSync('admin.html', 'utf8');

// Remove external script tags
let cleaned = html.replace(/<script[^>]*src="[^"]+"[^>]*><\/script>/g, '');

// Extract inline scripts
const scripts = cleaned.match(/<script[^>]*>([\s\S]*?)<\/script>/g);
if (!scripts) { console.log('No scripts found'); process.exit(0); }

// Get the last (main app) script
const lastScriptTag = scripts[scripts.length - 1];
const code = lastScriptTag.replace(/<\/?script[^>]*>/g, '');

let backticks = 0;
for (const ch of code) if (ch === '`') backticks++;
console.log('Backticks:', backticks, 'Even:', backticks % 2 === 0);

let braces = 0;
for (const ch of code) { if (ch === '{') braces++; if (ch === '}') braces--; }
console.log('Brace balance:', braces);

let parens = 0;
for (const ch of code) { if (ch === '(') parens++; if (ch === ')') parens--; }
console.log('Paren balance:', parens);

try {
  new Function(code);
  console.log('SYNTAX: OK');
} catch (e) {
  console.log('SYNTAX ERROR:', e.message);
}
