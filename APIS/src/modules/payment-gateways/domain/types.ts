// ═══════════════════════════════════════════════════════════════════════════
// Payment Gateways - shared types
// ═══════════════════════════════════════════════════════════════════════════

export type GatewayProvider = 'swiftpass_alipay' | 'swiftpass_wechat' | 'jdb_yespay';

export const GATEWAY_PROVIDERS: GatewayProvider[] = ['swiftpass_alipay', 'swiftpass_wechat', 'jdb_yespay'];

export type SwiftPassSignType = 'MD5' | 'SHA256' | 'RSA_1_256';

export interface SwiftPassConfig {
    mchId: string;
    deviceInfo: string;
    signType: SwiftPassSignType;
    signKey: string; // HMAC key for MD5/SHA256, or the RSA private key when signType is RSA_1_256
}

export interface JdbYesPayConfig {
    baseUrl: string; // JDB gives each merchant its own host, e.g. https://jdbyes.laoit.dev
    partnerId: string;
    clientId: string;
    clientSecret: string;
    merchantId: string;
    terminalId?: string;
}

export type GatewayConfig = SwiftPassConfig | JdbYesPayConfig;

export type QrPaymentStatus = 'pending' | 'paid' | 'expired' | 'failed';

export interface CreateQrPaymentParams {
    tenantId: string;
    branchId: string;
    provider: GatewayProvider;
    amount: number;
    notifyBaseUrl: string;
}

export interface CreateQrPaymentResult {
    outTradeNo: string;
    qrPayload: string;
    gatewayRef?: string;
    expiresAt: Date;
}
