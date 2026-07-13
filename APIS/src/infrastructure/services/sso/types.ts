export interface OidcConfig {
    issuerUrl: string;
    clientId: string;
    clientSecret: string;
    scopes?: string[]; // defaults to ['openid', 'email', 'profile']
}

export type SsoProviderType = 'oidc';
