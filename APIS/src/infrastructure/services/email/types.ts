export interface EmailAttachment {
    filename: string;
    content: string; // base64
    contentType?: string;
}

export interface IEmailAdapter {
    send(to: string[], subject: string, html: string, attachments?: EmailAttachment[]): Promise<void>;
    verify(): Promise<boolean>;
}

export interface SmtpConfig {
    host: string;
    port: number;
    secure?: boolean;
    user: string;
    pass: string;
    from: string;
    fromName?: string;
}

export interface BrevoConfig {
    apiKey: string;
    from: string;
    fromName?: string;
}

export interface SendGridConfig {
    apiKey: string;
    from: string;
    fromName?: string;
}

export interface MailgunConfig {
    apiKey: string;
    domain: string;
    from: string;
    fromName?: string;
    region?: 'us' | 'eu';
}

export type EmailProviderType = 'smtp' | 'brevo' | 'sendgrid' | 'mailgun';

export type EmailProviderConfig = SmtpConfig | BrevoConfig | SendGridConfig | MailgunConfig;
