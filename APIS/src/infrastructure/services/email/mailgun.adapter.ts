import type { IEmailAdapter, EmailAttachment, MailgunConfig } from './types';

export class MailgunAdapter implements IEmailAdapter {
    constructor(private config: MailgunConfig) {}

    private baseUrl(): string {
        return this.config.region === 'eu' ? 'https://api.eu.mailgun.net/v3' : 'https://api.mailgun.net/v3';
    }

    async send(to: string[], subject: string, html: string, attachments?: EmailAttachment[]): Promise<void> {
        const form = new FormData();
        form.set('from', this.config.fromName ? `${this.config.fromName} <${this.config.from}>` : this.config.from);
        for (const email of to) form.append('to', email);
        form.set('subject', subject);
        form.set('html', html);
        for (const a of attachments || []) {
            const bytes = Buffer.from(a.content, 'base64');
            form.append('attachment', new Blob([bytes], { type: a.contentType || 'application/octet-stream' }), a.filename);
        }

        const res = await fetch(`${this.baseUrl()}/${this.config.domain}/messages`, {
            method: 'POST',
            headers: { Authorization: `Basic ${Buffer.from(`api:${this.config.apiKey}`).toString('base64')}` },
            body: form,
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`Mailgun send failed (${res.status}): ${body}`);
        }
    }

    async verify(): Promise<boolean> {
        try {
            const res = await fetch(`${this.baseUrl()}/${this.config.domain}`, {
                headers: { Authorization: `Basic ${Buffer.from(`api:${this.config.apiKey}`).toString('base64')}` },
            });
            return res.ok;
        } catch {
            return false;
        }
    }
}
