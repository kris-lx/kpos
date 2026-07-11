import { BrevoClient } from '@getbrevo/brevo';
import type { IEmailAdapter, EmailAttachment, BrevoConfig } from './types';

export class BrevoAdapter implements IEmailAdapter {
    private client: BrevoClient;

    constructor(private config: BrevoConfig) {
        this.client = new BrevoClient({ apiKey: config.apiKey });
    }

    async send(to: string[], subject: string, html: string, attachments?: EmailAttachment[]): Promise<void> {
        await this.client.transactionalEmails.sendTransacEmail({
            subject,
            sender: { name: this.config.fromName || 'KPOS', email: this.config.from },
            to: to.map(email => ({ email })),
            htmlContent: html,
            attachment: attachments?.map(a => ({ name: a.filename, content: a.content })),
        });
    }

    async verify(): Promise<boolean> {
        try {
            await this.client.account.getAccount();
            return true;
        } catch {
            return false;
        }
    }
}
