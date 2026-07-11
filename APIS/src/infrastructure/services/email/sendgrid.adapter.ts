import type { IEmailAdapter, EmailAttachment, SendGridConfig } from './types';

const SENDGRID_API = 'https://api.sendgrid.com/v3/mail/send';

export class SendGridAdapter implements IEmailAdapter {
    constructor(private config: SendGridConfig) {}

    async send(to: string[], subject: string, html: string, attachments?: EmailAttachment[]): Promise<void> {
        const res = await fetch(SENDGRID_API, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                personalizations: [{ to: to.map(email => ({ email })) }],
                from: { email: this.config.from, name: this.config.fromName || 'KPOS' },
                subject,
                content: [{ type: 'text/html', value: html }],
                attachments: attachments?.map(a => ({
                    filename: a.filename,
                    content: a.content,
                    type: a.contentType || 'application/octet-stream',
                    disposition: 'attachment',
                })),
            }),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`SendGrid send failed (${res.status}): ${body}`);
        }
    }

    async verify(): Promise<boolean> {
        try {
            const res = await fetch('https://api.sendgrid.com/v3/scopes', {
                headers: { Authorization: `Bearer ${this.config.apiKey}` },
            });
            return res.ok;
        } catch {
            return false;
        }
    }
}
