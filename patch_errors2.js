const fs = require('fs');

// main.ts
let mainCode = fs.readFileSync('client/src/main.ts', 'utf-8');
mainCode = mainCode.replace("err.message || err", "err instanceof Error ? err.message : String(err)");
fs.writeFileSync('client/src/main.ts', mainCode);

// P2PNetwork.ts
let p2pCode = fs.readFileSync('client/src/P2PNetwork.ts', 'utf-8');
p2pCode = p2pCode.replace("e.message || e", "e instanceof Error ? e.message : String(e)");
p2pCode = p2pCode.replace("console.log(`[Network] Burn event for ${data.hash} handled locally. NOT broadcasting.`);", "console.log(`[Network] Burn event for ${(data as any).hash} handled locally. NOT broadcasting.`);");
fs.writeFileSync('client/src/P2PNetwork.ts', p2pCode);
