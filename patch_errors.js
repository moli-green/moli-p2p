const fs = require('fs');

// 1. Fix P2PNetwork.ts
let p2pCode = fs.readFileSync('client/src/P2PNetwork.ts', 'utf-8');
p2pCode = p2pCode.replace("import { PeerSession, FileOffer } from './PeerSession';", "import { PeerSession, type FileOffer } from './PeerSession';");
p2pCode = p2pCode.replace("console.warn(`[${this.myId}] Failed to process burn signal from ${session.sessionPeerId}:`, e.message || e);", "console.warn(`[${this.myId}] Failed to process burn signal from ${session.sessionPeerId}:`, e instanceof Error ? e.message : String(e));");
p2pCode = p2pCode.replace("const offer = data as FileOffer;", "const offer = data as unknown as FileOffer;");
fs.writeFileSync('client/src/P2PNetwork.ts', p2pCode);

// 2. Fix vault.ts
let vaultCode = fs.readFileSync('client/src/lib/vault.ts', 'utf-8');
vaultCode = vaultCode.replace("const items = results.map((data: unknown) => {", "const items = results.map((data: any) => {");
// We revert this `any` in vault.ts because `data` from IDB mapping is inherently any and we can't type it without type narrowing. It's safer to use any or define a proper DB type. Let's use any for now or a DBItem interface.
vaultCode = vaultCode.replace("const items = results.map((data: any) => {", "const items = results.map((data: any) => {"); // Reverting it to any since it's an IDBCursor
fs.writeFileSync('client/src/lib/vault.ts', vaultCode);

// 3. Fix main.ts
let mainCode = fs.readFileSync('client/src/main.ts', 'utf-8');
mainCode = mainCode.replace("import { PeerSession, FileOffer } from './PeerSession';", "import { PeerSession, type FileOffer } from './PeerSession';");
mainCode = mainCode.replace("Error: ${err instanceof Error ? err.message : String(err)}", "Error: ${err instanceof Error ? err.message : String(err)}"); // This is fine. Wait, let me check where the error is.
fs.writeFileSync('client/src/main.ts', mainCode);
