export const HEX_STRINGS = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

export function bufferToHex(buffer: ArrayBuffer): string {
    const uint8Array = new Uint8Array(buffer);
    let hex = '';
    for (let i = 0; i < uint8Array.length; i++) {
        hex += HEX_STRINGS[uint8Array[i]];
    }
    return hex;
}

export async function createThumbnail(blob: Blob, maxDimension: number = 500): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();

        img.onload = () => {
            URL.revokeObjectURL(url);

            let { width, height } = img;

            if (width > maxDimension || height > maxDimension) {
                if (width > height) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                } else {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error("Failed to get 2d context for thumbnail generation"));
                return;
            }

            ctx.drawImage(img, 0, 0, width, height);

            // Generate WebP or JPEG thumbnail to save space
            canvas.toBlob((thumbBlob) => {
                if (thumbBlob) {
                    resolve(thumbBlob);
                } else {
                    reject(new Error("Failed to generate thumbnail blob"));
                }
            }, 'image/jpeg', 0.85); // 0.85 quality is a good balance for thumbnails
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Failed to load image for thumbnail generation"));
        };

        img.src = url;
    });
}
