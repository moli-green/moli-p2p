const fs = require('fs');

let code = fs.readFileSync('client/src/P2PNetwork.ts', 'utf-8');

// 1. Add FileOffer import
code = code.replace("import { PeerSession } from './PeerSession';", "import { PeerSession, FileOffer } from './PeerSession';");

// 2. Fix constructor arguments
code = code.replace("private onEvent: (type: 'connected' | 'sync-request' | 'inventory' | 'offer-file' | 'verified-image' | 'burn', session: PeerSession, data?: any) => void,", "private onEvent: (type: 'connected' | 'sync-request' | 'inventory' | 'offer-file' | 'verified-image' | 'burn', session: PeerSession, data?: unknown) => void,");
code = code.replace("private onOfferFile: (session: PeerSession, data: any) => void,", "private onOfferFile: (session: PeerSession, data: FileOffer) => void,");

// 3. Fix handleSessionEvent
code = code.replace("private handleSessionEvent(type: 'connected' | 'sync-request' | 'inventory' | 'offer-file' | 'verified-image' | 'burn', session: PeerSession, data?: any) {", "private handleSessionEvent(type: 'connected' | 'sync-request' | 'inventory' | 'offer-file' | 'verified-image' | 'burn', session: PeerSession, data?: unknown) {");

// 4. Fix catch
code = code.replace("} catch (e: any) {", "} catch (e: unknown) {");

// 5. Fix type casts internally if necessary (onOfferFile cast)
code = code.replace("this.onOfferFile?.(session, data);", "this.onOfferFile?.(session, data as FileOffer);");

fs.writeFileSync('client/src/P2PNetwork.ts', code);
