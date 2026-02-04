// src/lib/PeerMachine.ts
import { setup, fromPromise } from 'xstate';

// 1. Context (Data)
export interface PeerContext {
    pc: RTCPeerConnection;
    error: unknown | null;
    isPolite: boolean;
    candidateQueue: RTCIceCandidateInit[];
}

// 2. Events (External Stimuli)
export type PeerEvent =
    | { type: 'NEGOTIATION_NEEDED' }
    | { type: 'SIGNAL_OFFER'; sdp: RTCSessionDescriptionInit }
    | { type: 'SIGNAL_ANSWER'; sdp: RTCSessionDescriptionInit }
    | { type: 'SIGNAL_CANDIDATE'; candidate: RTCIceCandidateInit };

// 3. Actions / Logic
export const peerMachine = setup({
    types: {
        context: {} as PeerContext,
        events: {} as PeerEvent,
        input: {} as { pc: RTCPeerConnection; isPolite: boolean },
    },
    actions: {
        sendOffer: () => {
            // Side effect: Send Offer (Implemented via injection)
            console.log('[PeerMachine] Action: sendOffer (Placeholder)');
        },
        sendAnswer: () => {
            // Side effect: Send Answer (Implemented via injection)
            console.log('[PeerMachine] Action: sendAnswer (Placeholder)');
        },
        logError: ({ context }) => console.error('[PeerMachine] Error:', context.error),
        addIceCandidate: async ({ context, event }) => {
            if (event.type === 'SIGNAL_CANDIDATE') {
                if (!context.pc.remoteDescription && context.pc.signalingState !== 'stable') {
                    // Queue if remote description is not set (and not stable? actually if remoteDescription is null, we can't add)
                    // Check remoteDescription is safer.
                    console.log('[PeerMachine] Queueing ICE candidate (No Remote Description)');
                    context.candidateQueue.push(event.candidate);
                    return;
                }

                try {
                    await context.pc.addIceCandidate(event.candidate);
                } catch (err) {
                    if (!context.pc.remoteDescription) {
                        console.log('[PeerMachine] Failed to add ICE candidate (Queueing retry)', err);
                        context.candidateQueue.push(event.candidate);
                    } else {
                        console.warn('[PeerMachine] Failed to add ICE candidate', err);
                    }
                }
            }
        },
        flushCandidates: async ({ context }) => {
            if (context.candidateQueue.length > 0) {
                console.log(`[PeerMachine] Flushing ${context.candidateQueue.length} candidates`);
                for (const c of context.candidateQueue) {
                    try {
                        await context.pc.addIceCandidate(c);
                    } catch (e) {
                        console.warn('[PeerMachine] Failed to flush candidate', e);
                    }
                }
                context.candidateQueue.length = 0; // Clear
            }
        }
    },
    guards: {
        isPolite: ({ context }) => context.isPolite,
    },
    actors: {
        setLocalOffer: fromPromise(async ({ input }: { input: { pc: RTCPeerConnection } }) => {
            const { pc } = input;
            await pc.setLocalDescription();
            return pc.localDescription;
        }),
        handleRemoteSdp: fromPromise(async ({ input }: { input: { pc: RTCPeerConnection; sdp: RTCSessionDescriptionInit; type: 'offer' | 'answer'; isPolite: boolean } }) => {
            const { pc, sdp, type, isPolite } = input;
            // Perfect Negotiation Logic

            if (type === 'offer') {
                const isStable = pc.signalingState === 'stable';
                const offerCollision = !isStable;

                if (offerCollision && !isPolite) {
                    console.log('[PeerMachine] Ignore Offer (Impolite + Collision)');
                    throw new Error('IGNORE_OFFER');
                }
                if (offerCollision && isPolite) {
                    console.log('[PeerMachine] Rollback (Polite + Collision)');
                    await pc.setLocalDescription({ type: 'rollback' });
                }
                await pc.setRemoteDescription(sdp);
                if (type === 'offer') {
                    await pc.setLocalDescription(); // Create Answer
                    return pc.localDescription;
                }
            } else {
                // Answer received
                if (pc.signalingState === 'stable') {
                    console.log('[PeerMachine] Ignore Answer (Stable)');
                    return;
                }
                await pc.setRemoteDescription(sdp);
            }
        }),
    }
}).createMachine({
    id: 'peerConnection',
    initial: 'stable',
    context: ({ input }) => ({
        pc: input.pc,
        isPolite: input.isPolite,
        error: null,
        candidateQueue: []
    }),
    // Global event handlers
    on: {
        SIGNAL_CANDIDATE: {
            actions: 'addIceCandidate'
        }
    },
    states: {
        stable: {
            on: {
                NEGOTIATION_NEEDED: {
                    target: 'makingOffer'
                },
                SIGNAL_OFFER: {
                    target: 'processingOffer',
                },
                SIGNAL_ANSWER: {
                    target: 'processingAnswer'
                }
            }
        },
        makingOffer: {
            invoke: {
                src: 'setLocalOffer',
                input: ({ context }) => ({ pc: context.pc }),
                onDone: {
                    target: 'stable',
                    actions: 'sendOffer'
                },
                onError: {
                    target: 'stable',
                    actions: 'logError'
                }
            },
            on: {
                SIGNAL_OFFER: {
                    guard: 'isPolite',
                    target: 'processingOffer'
                }
            }
        },
        processingOffer: {
            invoke: {
                src: 'handleRemoteSdp',
                input: ({ context, event }) => {
                    return {
                        pc: context.pc,
                        sdp: (event as any).sdp,
                        type: 'offer',
                        isPolite: context.isPolite
                    };
                },
                onDone: {
                    target: 'stable',
                    actions: ['sendAnswer', 'flushCandidates']
                },
                onError: {
                    target: 'stable',
                    actions: ({ event }) => console.log('[PeerMachine] Handled Offer Error:', event)
                }
            }
        },
        processingAnswer: {
            invoke: {
                src: 'handleRemoteSdp',
                input: ({ context, event }) => {
                    return {
                        pc: context.pc,
                        sdp: (event as any).sdp,
                        type: 'answer',
                        isPolite: context.isPolite
                    };
                },
                onDone: {
                    target: 'stable',
                    actions: 'flushCandidates'
                },
                onError: {
                    target: 'stable',
                    actions: 'logError'
                }
            }
        }
    }
});
