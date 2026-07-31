const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
let cleaned = html.replace(/<script[^>]*src="[^"]+"[^>]*><\/script>/g, '');
const scripts = cleaned.match(/<script[^>]*>([\s\S]*?)<\/script>/g);
const lastScriptTag = scripts[scripts.length - 1];
const code = lastScriptTag.replace(/<\/?script[^>]*>/g, '');
let bt = 0; for (const ch of code) if (ch === '`') bt++;
console.log('Backticks:', bt, 'Even:', bt % 2 === 0);
let br = 0; for (const ch of code) { if (ch === '{') br++; if (ch === '}') br--; }
console.log('Brace:', br);
let pa = 0; for (const ch of code) { if (ch === '(') pa++; if (ch === ')') pa--; }
console.log('Paren:', pa);
try { new Function(code); console.log('SYNTAX OK'); }
catch (e) { console.log('SYNTAX ERROR:', e.message); }
