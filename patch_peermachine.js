const fs = require('fs');
let code = fs.readFileSync('client/src/lib/PeerMachine.ts', 'utf-8');
code = code.replace("sdp: (event as any).sdp", "sdp: (event as unknown as { sdp: RTCSessionDescriptionInit }).sdp");
code = code.replace("sdp: (event as any).sdp", "sdp: (event as unknown as { sdp: RTCSessionDescriptionInit }).sdp");
fs.writeFileSync('client/src/lib/PeerMachine.ts', code);
