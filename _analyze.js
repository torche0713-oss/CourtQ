const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\User\\OneDrive\\Documents\\CourtQ\\portal.html', 'utf8');
const scriptMatch = content.match(/<script>([\s\S]*?)<\/script>/);
if(scriptMatch) {
    const js = scriptMatch[1];
    console.log('Script length:', js.length);

    // Check brace balance by ignoring template literals
    let depth = 0;
    let inTemplate = false;
    let inString2 = false;
    let strChar = '';
    let inLineComment = false;
    let minDepth = 0;
    let maxDepth = 0;
    let errorLoc = -1;
    for(let i = 0; i < js.length; i++) {
        const c = js[i];
        const n = js[i+1] || '';
        
        if(inLineComment) {
            if(c === '\n') inLineComment = false;
            continue;
        }
        
        if(c === '/' && n === '/') { inLineComment = true; i++; continue; }
        if(c === '/' && n === '*') { i++; while(i < js.length-1 && !(js[i] === '*' && js[i+1] === '/')) i++; i++; continue; }
        
        if(inString2) {
            if(c === '\\') i++;
            else if(c === strChar) inString2 = false;
            continue;
        }
        
        if(!inTemplate) {
            if(c === '"' || c === "'") { inString2 = true; strChar = c; continue; }
        }
        
        if(c === '`') {
            inTemplate = !inTemplate;
            continue;
        }
        
        if(!inTemplate) {
            if(c === '{') { depth++; if(depth > maxDepth) maxDepth = depth; }
            if(c === '}') { depth--; if(depth < minDepth) { minDepth = depth; errorLoc = i; } }
        }
    }
    console.log('Final depth:', depth, 'Min:', minDepth, 'Max:', maxDepth, 'Error at char:', errorLoc);
    if(errorLoc >= 0) {
        console.log('Context around error:', js.substring(Math.max(0,errorLoc-50), errorLoc+10));
    }
    
    // Specifically check selectOpSession
    const selIdx = js.indexOf('function selectOpSession');
    const upIdx = js.indexOf('function updateOpFeeTotal', selIdx);
    const selFunc = js.substring(selIdx, upIdx);
    
    let selDepth = 0;
    let selInTemplate = false;
    let selErrorLoc = -1;
    for(let i = 0; i < selFunc.length; i++) {
        const c = selFunc[i];
        if(c === '`') { selInTemplate = !selInTemplate; continue; }
        if(!selInTemplate) {
            if(c === '{') selDepth++;
            if(c === '}') { selDepth--; if(selDepth < 0) { selErrorLoc = i; break; } }
        }
    }
    console.log('\nselectOpSession depth:', selDepth, 'Error:', selErrorLoc);
    if(selErrorLoc >= 0) {
        console.log('Context:', selFunc.substring(Math.max(0,selErrorLoc-50), selErrorLoc+10));
    }
}
