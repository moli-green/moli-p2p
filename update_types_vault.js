const fs = require('fs');

// Update types.ts
let typesCode = fs.readFileSync('client/src/types.ts', 'utf-8');
typesCode = typesCode.replace("receipt?: any; // Signed Honorable Receipt", "receipt?: unknown; // Signed Honorable Receipt");
fs.writeFileSync('client/src/types.ts', typesCode);

// Update vault.ts
let vaultCode = fs.readFileSync('client/src/lib/vault.ts', 'utf-8');
vaultCode = vaultCode.replace("receipt?: any;", "receipt?: unknown;");
vaultCode = vaultCode.replace("static async updateReceipt(hash: string, receipt: any): Promise<void> {", "static async updateReceipt(hash: string, receipt: unknown): Promise<void> {");
vaultCode = vaultCode.replace("const items = results.map((data: any) => {", "const items = results.map((data: unknown) => {");

// There is one tricky any in vault.ts: delete (storedItem as any).blob;
vaultCode = vaultCode.replace("delete (storedItem as any).blob; // Ensure it's gone", "delete (storedItem as Partial<VaultItem>).blob; // Ensure it's gone");

fs.writeFileSync('client/src/lib/vault.ts', vaultCode);
