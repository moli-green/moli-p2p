export const HEX_STRINGS = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

export function bufferToHex(buffer: ArrayBuffer): string {
    const uint8Array = new Uint8Array(buffer);
    let hex = '';
    for (let i = 0; i < uint8Array.length; i++) {
        hex += HEX_STRINGS[uint8Array[i]];
    }
    return hex;
}
