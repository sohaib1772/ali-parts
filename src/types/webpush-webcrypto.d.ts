declare module "webpush-webcrypto" {
  export class ApplicationServerKeys {
    publicKey: unknown;
    privateKey: unknown;
    static generate(): Promise<ApplicationServerKeys>;
    static fromJSON(keys: { publicKey: string; privateKey: string }): Promise<ApplicationServerKeys>;
    toJSON(): Promise<{ publicKey: string; privateKey: string }>;
  }
  export function setWebCrypto(crypto: Crypto): void;
  export function generatePushHTTPRequest(options: {
    payload: string | Uint8Array;
    applicationServerKeys: ApplicationServerKeys;
    target: { endpoint: string; keys: { p256dh: string; auth: string } };
    adminContact: string;
    ttl: number;
    topic?: string;
    urgency?: "very-low" | "low" | "normal" | "high";
  }): Promise<{ headers: Record<string, string>; body: ArrayBuffer; endpoint: string }>;
}