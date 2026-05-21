// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Email Service (Brevo)
// ═══════════════════════════════════════════════════════════════════════════

import { BrevoClient } from '@getbrevo/brevo';
import { emailConfig } from '@/config/app.config';

const SENDER = { name: 'kpos', email: 'abd83c001@smtp-brevo.com' };

let _brevo: BrevoClient | null = null;
function getBrevo(): BrevoClient {
    if (!_brevo) {
        _brevo = new BrevoClient({ apiKey: emailConfig.apiKey });
    }
    return _brevo;
}

export async function sendPasswordResetEmail(to: string, name: string, token: string): Promise<void> {
    if (!emailConfig.apiKey) {
        console.warn('[Email] BREVO_API_KEY not set — skipping password reset email');
        return;
    }

    const resetUrl = `${emailConfig.appUrl}/reset-password?token=${token}`;

    try {
        await getBrevo().transactionalEmails.sendTransacEmail({
            subject: 'ລີເຊັດລະຫັດຜ່ານ / Reset Your Password',
            sender: SENDER,
            to: [{ email: to, name }],
            htmlContent: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #6366f1, #4f46e5); padding: 32px; text-align: center;">
      <h1 style="color: #fff; margin: 0; font-size: 24px;">KPOS</h1>
      <p style="color: #c7d2fe; margin: 8px 0 0;">ລີເຊັດລະຫັດຜ່ານ</p>
    </div>
    <div style="padding: 32px;">
      <p style="color: #374151; font-size: 16px;">ສະບາຍດີ <strong>${name}</strong>,</p>
      <p style="color: #6b7280; font-size: 15px; line-height: 1.6;">
        ພວກເຮົາໄດ້ຮັບການຮ້ອງຂໍໃຫ້ລີເຊັດລະຫັດຜ່ານສຳລັບບັນຊີຂອງທ່ານ.
        ກົດປຸ່ມດ້ານລຸ່ມເພື່ອສ້າງລະຫັດຜ່ານໃໝ່.
      </p>
      <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
        We received a request to reset the password for your account.
        Click the button below to create a new password.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetUrl}" style="background: #4f46e5; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">
          ລີເຊັດລະຫັດຜ່ານ / Reset Password
        </a>
      </div>
      <p style="color: #9ca3af; font-size: 13px; line-height: 1.5;">
        ລິ້ງນີ້ຈະໝົດອາຍຸໃນ <strong>1 ຊົ່ວໂມງ</strong>. ຖ້າທ່ານບໍ່ໄດ້ຮ້ອງຂໍ, ກະລຸນາລະເລີຍ.<br>
        This link expires in <strong>1 hour</strong>. If you didn't request this, please ignore this email.
      </p>
    </div>
    <div style="background: #f9fafb; padding: 16px; text-align: center;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">© 2026 KPOS — Enterprise POS System</p>
    </div>
  </div>
</body>
</html>`,
        });
    } catch (err: any) {
        console.error('[Email] Failed to send password reset email:', err?.message || err);
        throw new Error('Failed to send email');
    }
}

export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
    if (!emailConfig.apiKey) {
        console.warn('[Email] BREVO_API_KEY not set — skipping welcome email');
        return;
    }

    try {
        await getBrevo().transactionalEmails.sendTransacEmail({
            subject: 'ຍິນດີຕ້ອນຮັບສູ່ KPOS / Welcome to KPOS',
            sender: SENDER,
            to: [{ email: to, name }],
            htmlContent: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #6366f1, #4f46e5); padding: 32px; text-align: center;">
      <h1 style="color: #fff; margin: 0; font-size: 24px;">KPOS</h1>
      <p style="color: #c7d2fe; margin: 8px 0 0;">ຍິນດີຕ້ອນຮັບ / Welcome</p>
    </div>
    <div style="padding: 32px;">
      <p style="color: #374151; font-size: 16px;">ສະບາຍດີ <strong>${name}</strong>,</p>
      <p style="color: #6b7280; font-size: 15px; line-height: 1.6;">
        ບັນຊີຂອງທ່ານໄດ້ຖືກອະນຸມັດແລ້ວ. ທ່ານສາມາດເຂົ້າສູ່ລະບົບໄດ້ທັນທີ.
      </p>
      <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
        Your account has been approved. You can now log in.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${emailConfig.appUrl}/login" style="background: #4f46e5; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">
          ເຂົ້າສູ່ລະບົບ / Login
        </a>
      </div>
    </div>
    <div style="background: #f9fafb; padding: 16px; text-align: center;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">© 2026 KPOS — Enterprise POS System</p>
    </div>
  </div>
</body>
</html>`,
        });
    } catch (err: any) {
        console.error('[Email] Failed to send welcome email:', err?.message || err);
    }
}
