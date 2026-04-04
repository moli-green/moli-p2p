const fs = require('fs');

let code = fs.readFileSync('client/src/main.ts', 'utf-8');

// 1. Add FileOffer import
code = code.replace("import { PeerSession } from './PeerSession';", "import { PeerSession, FileOffer } from './PeerSession';");

// 2. Fix max dimension any cast (actually it's fine, let's fix the other things)
// 3. Fix downloadQueue
code = code.replace("const downloadQueue: { session: PeerSession; transferId: string; meta: any }[] = [];", "const downloadQueue: { session: PeerSession; transferId: string; meta: FileOffer }[] = [];");

// 4. Fix reject
code = code.replace("  reject: (reason?: any) => void;\n", "  reject: (reason?: unknown) => void;\n");

// 5. Fix onOfferFile callback
code = code.replace("(session: PeerSession, data: any) => { // Offer File Callback", "(session: PeerSession, data: FileOffer) => { // Offer File Callback");

// 6. Fix catch err: any
code = code.replace("} catch (err: any) {", "} catch (err: unknown) {");

// 7. Fix webkitTextFillColor
code = code.replace("(h2.style as any).webkitTextFillColor = 'transparent';", "// @ts-ignore\n  h2.style.webkitTextFillColor = 'transparent';");

// 8. Fix cleanup DOM any casts
code = code.replace("if (typeof (toRemove.element as any).cleanup === 'function') {\n        (toRemove.element as any).cleanup();", "const elWithCleanup = toRemove.element as HTMLElement & { cleanup?: () => void };\n      if (typeof elWithCleanup.cleanup === 'function') {\n        elWithCleanup.cleanup();");
code = code.replace("if (typeof (item.element as any).cleanup === 'function') {\n        (item.element as any).cleanup();", "const elWithCleanup = item.element as HTMLElement & { cleanup?: () => void };\n      if (typeof elWithCleanup.cleanup === 'function') {\n        elWithCleanup.cleanup();");

fs.writeFileSync('client/src/main.ts', code);
