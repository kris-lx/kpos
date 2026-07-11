// ═══════════════════════════════════════════════════════════════════════════
// Seed system-default email templates (tenantId = NULL) so tenants that
// configure their own provider without writing a custom template still get
// a working email. Idempotent — only inserts rows that don't already exist.
// ═══════════════════════════════════════════════════════════════════════════

import { db } from '@/config/database.config';
import { emailTemplates } from '@/db/schema/tables';
import { and, eq, isNull } from 'drizzle-orm';

const DEFAULT_TEMPLATES: { key: string; subject: string; htmlBody: string }[] = [
    {
        key: 'password_reset',
        subject: 'Reset Your Password',
        htmlBody: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background:#f4f4f4; margin:0; padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:32px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:24px;">KPOS</h1>
      <p style="color:#c7d2fe;margin:8px 0 0;">Reset Your Password</p>
    </div>
    <div style="padding:32px;">
      <p style="color:#374151;font-size:16px;">Hi <strong>{{name}}</strong>,</p>
      <p style="color:#6b7280;font-size:15px;line-height:1.6;">We received a request to reset the password for your account.</p>
      <div style="text-align:center;margin:32px 0;">
        <a href="{{resetUrl}}" style="background:#4f46e5;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;display:inline-block;">Reset Password</a>
      </div>
      <p style="color:#9ca3af;font-size:13px;line-height:1.5;">This link expires in <strong>1 hour</strong>. If you didn't request this, please ignore this email.</p>
    </div>
  </div>
</body></html>`,
    },
    {
        key: 'welcome',
        subject: 'Welcome to KPOS',
        htmlBody: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background:#f4f4f4; margin:0; padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:32px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:24px;">KPOS</h1>
      <p style="color:#c7d2fe;margin:8px 0 0;">Welcome</p>
    </div>
    <div style="padding:32px;">
      <p style="color:#374151;font-size:16px;">Hi <strong>{{name}}</strong>,</p>
      <p style="color:#6b7280;font-size:15px;line-height:1.6;">Your account has been approved. You can now log in.</p>
      <div style="text-align:center;margin:32px 0;">
        <a href="{{loginUrl}}" style="background:#4f46e5;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;display:inline-block;">Login</a>
      </div>
    </div>
  </div>
</body></html>`,
    },
    {
        key: 'low_stock_alert',
        subject: 'Low Stock Alert: {{productName}}',
        htmlBody: `<p>{{productName}} at {{branchName}} is low on stock: <strong>{{quantity}}</strong> remaining (threshold: {{threshold}}).</p>`,
    },
    {
        key: 'shift_summary',
        subject: 'Shift Summary — {{branchName}}',
        htmlBody: `<p>Shift closed by {{userName}} at {{branchName}}.</p><p>Total sales: {{totalSales}}<br/>Cash: {{cashTotal}}<br/>Duration: {{hoursWorked}}h</p>`,
    },
];

export async function ensureDefaultEmailTemplates(): Promise<void> {
    for (const tpl of DEFAULT_TEMPLATES) {
        const existing = await db.query.emailTemplates.findFirst({
            where: and(eq(emailTemplates.key, tpl.key), isNull(emailTemplates.tenantId)),
        });
        if (!existing) {
            await db.insert(emailTemplates).values({ tenantId: null, key: tpl.key, subject: tpl.subject, htmlBody: tpl.htmlBody });
        }
    }
}
