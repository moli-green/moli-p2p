const fs = require('fs');
let code = fs.readFileSync('client/src/types.ts', 'utf-8');
code = code.replace("sdp: z.any()", "sdp: z.custom<RTCSessionDescriptionInit>()");
code = code.replace("sdp: z.any()", "sdp: z.custom<RTCSessionDescriptionInit>()");
code = code.replace("candidate: z.any()", "candidate: z.custom<RTCIceCandidateInit>()");
fs.writeFileSync('client/src/types.ts', code);
