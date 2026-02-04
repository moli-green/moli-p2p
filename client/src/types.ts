import { z } from 'zod';

export const SignalSchema = z.discriminatedUnion('type', [
    // Join: broadcast (no targetId) or unicast reply (with targetId)
    z.object({ type: z.literal('join'), senderId: z.string(), peerId: z.string(), targetId: z.string().optional() }),

    // Targeted Signaling: targetId is MANDATORY
    z.object({ type: z.literal('offer'), senderId: z.string(), targetId: z.string(), sdp: z.any() }),
    z.object({ type: z.literal('answer'), senderId: z.string(), targetId: z.string(), sdp: z.any() }),
    z.object({ type: z.literal('candidate'), senderId: z.string(), targetId: z.string(), candidate: z.any() }),

    // Leave: broadcast from server
    z.object({ type: z.literal('leave'), senderId: z.string() }),
]);

export type SignalMessage = z.infer<typeof SignalSchema>;

export interface FileMeta {
    type: 'meta';
    name: string;
    size: number;
    mime: string;
    hash: string;
    publicKey?: string; // Base64 SPKI
    signature?: string; // Base64
    identityCreatedAt?: number;
    isPinned?: boolean;
    tributeTag?: string;
    receipt?: any; // Signed Honorable Receipt
}

export interface BurnSignal {
    type: 'burn';
    hash: string;
    publicKey: string;
    signature: string;
    identityCreatedAt: number;
}
