import nodemailer, { type Transporter } from 'nodemailer';
import type { IEmailAdapter, EmailAttachment, SmtpConfig } from './types';

export class SmtpAdapter implements IEmailAdapter {
    private transporter: Transporter;

    constructor(private config: SmtpConfig) {
        this.transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure ?? config.port === 465,
            auth: { user: config.user, pass: config.pass },
        });
    }

    async send(to: string[], subject: string, html: string, attachments?: EmailAttachment[]): Promise<void> {
        await this.transporter.sendMail({
            from: this.config.fromName ? `"${this.config.fromName}" <${this.config.from}>` : this.config.from,
            to: to.join(','),
            subject,
            html,
            attachments: attachments?.map(a => ({
                filename: a.filename,
                content: a.content,
                encoding: 'base64',
                contentType: a.contentType,
            })),
        });
    }

    async verify(): Promise<boolean> {
        try {
            await this.transporter.verify();
            return true;
        } catch {
            return false;
        }
    }
}
