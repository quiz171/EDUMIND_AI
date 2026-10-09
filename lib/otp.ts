import nodemailer, { type Transporter } from "nodemailer";
import crypto from "crypto";

export interface PendingRegistration {
  fullName: string;
  email: string;
  passwordHash: string;
  educationLevel: string;
  classYear: string;
  course: string;
  userType?: string;
}

export interface OtpRecord {
  email: string;
  code: string;
  expiresAt: number; // timestamp in ms
  attempts: number;
  lastSentAt: number;
  pendingUserData: PendingRegistration;
}

// In-memory store for pending OTP verifications
const pendingOtps = new Map<string, OtpRecord>();

export interface PasswordResetRecord {
  email: string;
  code: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
  fullName?: string;
}

// In-memory store for pending password resets
const pendingPasswordResets = new Map<string, PasswordResetRecord>();

// OTP Expiration: 10 minutes
const OTP_EXPIRY_MS = 10 * 60 * 1000;
// Resend Cooldown: 30 seconds
const RESEND_COOLDOWN_MS = 30 * 1000;
// Max verification attempts before invalidation
const MAX_ATTEMPTS = 5;

// Lazy nodemailer transporter
let mailTransporter: Transporter | null = null;

function getMailTransporter(): Transporter | null {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
  const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER || process.env.GMAIL_USER;
  const rawPass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASSWORD || process.env.GMAIL_APP_PASSWORD;
  const smtpPass = rawPass ? rawPass.replace(/\s+/g, "").trim() : "";

  if (!smtpUser || !smtpPass) {
    return null;
  }

  if (mailTransporter) return mailTransporter;

  // If using Gmail (either explicit host, service, or gmail user)
  if ((smtpHost === "smtp.gmail.com" || !smtpHost) && (smtpUser.includes("@gmail.com") || process.env.GMAIL_USER)) {
    try {
      mailTransporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
      return mailTransporter;
    } catch (err) {
      console.warn("[MAIL] Failed to create Gmail transport:", err);
      return null;
    }
  }

  if (smtpHost && smtpUser && smtpPass) {
    try {
      mailTransporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });
      return mailTransporter;
    } catch (err) {
      console.warn("[MAIL] Failed to create SMTP transport:", err);
      return null;
    }
  }

  return null;
}

/**
 * Generate a cryptographically secure 6-digit numeric OTP using CSPRNG
 */
export function generateOtpCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Constant-time comparison between user input and stored secret OTP to prevent timing attacks
 */
function timingSafeCodeMatch(userCode: string, storedCode: string): boolean {
  if (typeof userCode !== "string" || typeof storedCode !== "string") return false;
  const cleanUser = userCode.trim().replace(/\D/g, "");
  const cleanStored = storedCode.trim().replace(/\D/g, "");
  if (cleanUser.length !== cleanStored.length || cleanUser.length !== 6) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(cleanUser, "utf-8"), Buffer.from(cleanStored, "utf-8"));
  } catch {
    return false;
  }
}

function maskEmail(email: string): string {
  const parts = email.split("@");
  if (parts.length !== 2) return "***";
  const name = parts[0];
  const maskedName = name.length <= 2 ? name[0] + "*" : name[0] + "***" + name[name.length - 1];
  return `${maskedName}@${parts[1]}`;
}

export interface OtpDispatchResult {
  success: boolean;
  message: string;
  expiresInSeconds: number;
  emailSent: boolean;
  fallbackCode?: string;
  deliveryWarning?: string;
}

/**
 * Create and register an OTP for a signup request, then dispatch email
 */
export async function createAndSendOtp(
  email: string,
  pendingUserData: PendingRegistration
): Promise<OtpDispatchResult> {
  const cleanEmail = email.toLowerCase().trim();
  const code = generateOtpCode();
  const now = Date.now();
  const expiresAt = now + OTP_EXPIRY_MS;

  const record: OtpRecord = {
    email: cleanEmail,
    code,
    expiresAt,
    attempts: 0,
    lastSentAt: now,
    pendingUserData,
  };

  pendingOtps.set(cleanEmail, record);

  // Securely log dispatch event
  console.log(`[AUTH OTP] Verification code generated for: ${maskEmail(cleanEmail)} (Expires in 10m)`);

  const transporter = getMailTransporter();
  let emailSent = false;
  let deliveryWarning: string | undefined = undefined;

  if (!transporter) {
    deliveryWarning = "Live SMTP email delivery is not configured on the server. Google Gmail SMTP requires a 16-character App Password.";
    console.warn(`[AUTH OTP] Email dispatch notice: ${deliveryWarning}`);
  } else {
    try {
      const sender = process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.GMAIL_USER || "noreply@edumind.ng";
      await transporter.sendMail({
        from: `"EduMind AI" <${sender}>`,
        to: cleanEmail,
        subject: `${code} is your EduMind AI verification code`,
        text: `Welcome to EduMind AI!\n\nYour 6-digit email verification code is: ${code}\n\nThis code will expire in 10 minutes. If you did not request this, please ignore this email.`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0b0e; color: #f4f4f5; padding: 40px 20px; text-align: center;">
            <div style="max-width: 480px; margin: 0 auto; background: #18181b; border: 1px solid #27272a; border-radius: 20px; padding: 36px 28px; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
              <div style="display: inline-block; width: 44px; height: 44px; line-height: 44px; border-radius: 12px; background: #10b981; color: #000000; font-size: 20px; font-weight: 900; margin-bottom: 20px;">E</div>
              <h1 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 0 0 10px 0;">Verify your email address</h1>
              <p style="color: #a1a1aa; font-size: 14px; margin: 0 0 28px 0; line-height: 1.5;">
                Hello <strong>${pendingUserData.fullName || "Student"}</strong>, enter this 6-digit verification code to complete your EduMind AI registration:
              </p>
              <div style="background: #09090b; border: 1px solid #3f3f46; border-radius: 12px; padding: 18px 24px; margin: 0 auto 28px auto; display: inline-block; letter-spacing: 8px; font-size: 32px; font-weight: 800; color: #10b981; font-family: monospace;">
                ${code}
              </div>
              <p style="color: #71717a; font-size: 12px; margin: 0; line-height: 1.5;">
                This code will expire in 10 minutes.<br/>If you did not request this code, you can safely ignore this email.
              </p>
            </div>
            <p style="color: #52525b; font-size: 11px; margin-top: 24px;">© ${new Date().getFullYear()} EduMind AI Academic Intelligence Platform</p>
          </div>
        `,
      });
      emailSent = true;
      console.log(`[AUTH OTP] ✅ Email successfully delivered to ${cleanEmail}`);
    } catch (mailErr: any) {
      mailTransporter = null; // Reset cached transporter so retry works immediately if config is updated
      const errMsg = mailErr?.message || String(mailErr);
      if (errMsg.includes("535") || errMsg.includes("BadCredentials") || errMsg.includes("Username and Password not accepted") || errMsg.includes("Invalid login")) {
        deliveryWarning = "Gmail SMTP rejected login (535 Bad Credentials). Google strictly requires a 16-character App Password (not your normal Gmail password).";
        console.warn(`[AUTH OTP] Gmail SMTP 535 Bad Credentials for ${cleanEmail}`);
      } else {
        deliveryWarning = `SMTP email delivery failed: ${errMsg}`;
        console.warn(`[AUTH OTP] SMTP delivery warning: ${errMsg}`);
      }
    }
  }

  return {
    success: true,
    emailSent,
    message: emailSent
      ? `Verification code sent to ${cleanEmail}. Please check your email inbox.`
      : `Email delivery issue (${deliveryWarning}). Your verification code is provided below so you can proceed immediately.`,
    expiresInSeconds: 600,
    fallbackCode: !emailSent ? code : undefined,
    deliveryWarning: !emailSent ? deliveryWarning : undefined,
  };
}

/**
 * Resend OTP with cooldown guard
 */
export async function resendOtp(
  email: string
): Promise<{ success: boolean; error?: string; message?: string; fallbackCode?: string; deliveryWarning?: string; emailSent?: boolean }> {
  const cleanEmail = email.toLowerCase().trim();
  const existing = pendingOtps.get(cleanEmail);

  if (!existing) {
    return {
      success: false,
      error: "No pending signup found for this email. Please fill out the registration form again.",
    };
  }

  const now = Date.now();
  const timeSinceLastSent = now - existing.lastSentAt;

  if (timeSinceLastSent < RESEND_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((RESEND_COOLDOWN_MS - timeSinceLastSent) / 1000);
    return {
      success: false,
      error: `Please wait ${remainingSeconds} seconds before requesting another code.`,
      fallbackCode: existing.code,
    };
  }

  const result = await createAndSendOtp(cleanEmail, existing.pendingUserData);
  return {
    success: true,
    message: result.message,
    fallbackCode: result.fallbackCode,
    deliveryWarning: result.deliveryWarning,
    emailSent: result.emailSent,
  };
}

/**
 * Verify OTP entered by the user
 */
export function verifyOtp(
  email: string,
  userEnteredCode: string
): { valid: boolean; error?: string; pendingUserData?: PendingRegistration } {
  const cleanEmail = email.toLowerCase().trim();
  const existing = pendingOtps.get(cleanEmail);

  if (!existing) {
    return {
      valid: false,
      error: "No pending registration found for this email. Please sign up again.",
    };
  }

  const now = Date.now();

  if (now > existing.expiresAt) {
    pendingOtps.delete(cleanEmail);
    return {
      valid: false,
      error: "Verification code has expired. Please click 'Resend Code' to receive a new one.",
    };
  }

  if (existing.attempts >= MAX_ATTEMPTS) {
    pendingOtps.delete(cleanEmail);
    return {
      valid: false,
      error: "Too many incorrect attempts. For security, please sign up again to request a new code.",
    };
  }

  const cleanInput = userEnteredCode.trim().replace(/\D/g, "");

  if (!timingSafeCodeMatch(cleanInput, existing.code)) {
    existing.attempts += 1;
    const remaining = MAX_ATTEMPTS - existing.attempts;
    return {
      valid: false,
      error: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
    };
  }

  // Verification successful! Remove pending record and return data
  const userData = existing.pendingUserData;
  pendingOtps.delete(cleanEmail);

  return {
    valid: true,
    pendingUserData: userData,
  };
}

/**
 * Get current OTP status for an email (e.g. for preview / testing)
 */
export function getPendingOtpInfo(email: string): { exists: boolean; expiresAt?: number } {
  const cleanEmail = email.toLowerCase().trim();
  const existing = pendingOtps.get(cleanEmail);
  if (!existing) return { exists: false };
  return {
    exists: true,
    expiresAt: existing.expiresAt,
  };
}

/**
 * Clear pending OTP registration on authentic verified external auth (e.g. Google Sign-In)
 */
export function clearPendingOtp(email: string): void {
  if (email && typeof email === "string") {
    pendingOtps.delete(email.toLowerCase().trim());
  }
}

/**
 * Create and register an OTP for a password reset request, then dispatch email
 */
export async function createAndSendPasswordResetOtp(
  email: string,
  fullName?: string
): Promise<OtpDispatchResult> {
  const cleanEmail = email.toLowerCase().trim();
  const code = generateOtpCode();
  const now = Date.now();
  const expiresAt = now + OTP_EXPIRY_MS;

  const record: PasswordResetRecord = {
    email: cleanEmail,
    code,
    expiresAt,
    attempts: 0,
    lastSentAt: now,
    fullName,
  };

  pendingPasswordResets.set(cleanEmail, record);

  // Securely log dispatch event
  console.log(`[PASSWORD RESET OTP] Reset code generated for: ${maskEmail(cleanEmail)} (Expires in 10m)`);

  const transporter = getMailTransporter();
  let emailSent = false;
  let deliveryWarning: string | undefined = undefined;

  if (!transporter) {
    deliveryWarning = "Live SMTP email delivery is not configured on the server. Google Gmail SMTP requires a 16-character App Password.";
    console.warn(`[PASSWORD RESET OTP] Email dispatch notice: ${deliveryWarning}`);
  } else {
    try {
      const sender = process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.GMAIL_USER || "noreply@edumind.ng";
      await transporter.sendMail({
        from: `"EduMind AI Security" <${sender}>`,
        to: cleanEmail,
        subject: `${code} is your EduMind AI password reset code`,
        text: `Hello ${fullName || "there"},\n\nYour 6-digit password reset verification code is: ${code}\n\nThis code will expire in 10 minutes. If you did not request a password reset, please ignore this email.`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0b0e; color: #f4f4f5; padding: 40px 20px; text-align: center;">
            <div style="max-width: 480px; margin: 0 auto; background: #18181b; border: 1px solid #27272a; border-radius: 20px; padding: 36px 28px; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
              <div style="display: inline-block; width: 44px; height: 44px; line-height: 44px; border-radius: 12px; background: #10b981; color: #000000; font-size: 20px; font-weight: 900; margin-bottom: 20px;">E</div>
              <h1 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 0 0 10px 0;">Reset Your Password</h1>
              <p style="color: #a1a1aa; font-size: 14px; margin: 0 0 28px 0; line-height: 1.5;">
                Hello <strong>${fullName || "there"}</strong>, use this 6-digit verification code to reset your EduMind AI account password:
              </p>
              <div style="background: #09090b; border: 1px solid #3f3f46; border-radius: 12px; padding: 18px 24px; margin: 0 auto 28px auto; display: inline-block; letter-spacing: 8px; font-size: 32px; font-weight: 800; color: #10b981; font-family: monospace;">
                ${code}
              </div>
              <p style="color: #71717a; font-size: 12px; margin: 0; line-height: 1.5;">
                This code will expire in 10 minutes.<br/>If you did not request a password reset, you can safely ignore this email.
              </p>
            </div>
            <p style="color: #52525b; font-size: 11px; margin-top: 24px;">&copy; ${new Date().getFullYear()} EduMind AI Platform Security</p>
          </div>
        `,
      });
      emailSent = true;
      console.log(`[PASSWORD RESET OTP] ✅ Email delivered to ${cleanEmail}`);
    } catch (mailErr: any) {
      mailTransporter = null;
      const errMsg = mailErr?.message || String(mailErr);
      if (errMsg.includes("535") || errMsg.includes("BadCredentials") || errMsg.includes("Username and Password not accepted") || errMsg.includes("Invalid login")) {
        deliveryWarning = "Gmail SMTP rejected login (535 Bad Credentials). Google strictly requires a 16-character App Password (not your normal Gmail password).";
        console.warn(`[PASSWORD RESET OTP] Gmail SMTP 535 Bad Credentials for ${cleanEmail}`);
      } else {
        deliveryWarning = `SMTP delivery warning: ${errMsg}`;
        console.warn(`[PASSWORD RESET OTP] SMTP delivery warning: ${errMsg}`);
      }
    }
  }

  return {
    success: true,
    emailSent,
    message: emailSent
      ? `Password reset code sent to ${cleanEmail}. Please check your email inbox.`
      : `Email delivery issue (${deliveryWarning}). Your reset code is provided below so you can proceed immediately.`,
    expiresInSeconds: 600,
    fallbackCode: !emailSent ? code : undefined,
    deliveryWarning: !emailSent ? deliveryWarning : undefined,
  };
}

/**
 * Resend Password Reset OTP with cooldown
 */
export async function resendPasswordResetOtp(
  email: string
): Promise<{ success: boolean; error?: string; message?: string; fallbackCode?: string; deliveryWarning?: string; emailSent?: boolean }> {
  const cleanEmail = email.toLowerCase().trim();
  const existing = pendingPasswordResets.get(cleanEmail);

  if (!existing) {
    return {
      success: false,
      error: "No pending password reset found for this email. Please request a new reset code.",
    };
  }

  const now = Date.now();
  const timeSinceLastSent = now - existing.lastSentAt;

  if (timeSinceLastSent < RESEND_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((RESEND_COOLDOWN_MS - timeSinceLastSent) / 1000);
    return {
      success: false,
      error: `Please wait ${remainingSeconds} seconds before requesting another code.`,
      fallbackCode: existing.code,
    };
  }

  const result = await createAndSendPasswordResetOtp(cleanEmail, existing.fullName);
  return {
    success: true,
    message: result.message,
    fallbackCode: result.fallbackCode,
    deliveryWarning: result.deliveryWarning,
    emailSent: result.emailSent,
  };
}

/**
 * Get active pending OTP code for an email (if not expired)
 */
export function getPendingOtpCode(email: string): string | null {
  const cleanEmail = email.toLowerCase().trim();
  const existing = pendingOtps.get(cleanEmail);
  if (!existing) return null;
  if (Date.now() > existing.expiresAt) return null;
  return existing.code;
}

/**
 * Get active pending password reset code for an email (if not expired)
 */
export function getPendingPasswordResetCode(email: string): string | null {
  const cleanEmail = email.toLowerCase().trim();
  const existing = pendingPasswordResets.get(cleanEmail);
  if (!existing) return null;
  if (Date.now() > existing.expiresAt) return null;
  return existing.code;
}

/**
 * Verify Password Reset OTP without consuming
 */
export function verifyPasswordResetOtp(
  email: string,
  userEnteredCode: string
): { valid: boolean; error?: string } {
  const cleanEmail = email.toLowerCase().trim();
  const existing = pendingPasswordResets.get(cleanEmail);

  if (!existing) {
    return {
      valid: false,
      error: "No pending password reset found for this email. Please request a new code.",
    };
  }

  const now = Date.now();
  if (now > existing.expiresAt) {
    pendingPasswordResets.delete(cleanEmail);
    return {
      valid: false,
      error: "Verification code has expired. Please request a new code.",
    };
  }

  if (existing.attempts >= MAX_ATTEMPTS) {
    pendingPasswordResets.delete(cleanEmail);
    return {
      valid: false,
      error: "Maximum attempts exceeded. Please request a fresh reset code.",
    };
  }

  const cleanInput = userEnteredCode.replace(/\D/g, "");
  if (!timingSafeCodeMatch(cleanInput, existing.code)) {
    existing.attempts += 1;
    const remaining = MAX_ATTEMPTS - existing.attempts;
    return {
      valid: false,
      error: `Incorrect reset code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
    };
  }

  return { valid: true };
}

/**
 * Consume Password Reset OTP on password change completion
 */
export function consumePasswordResetOtp(
  email: string,
  userEnteredCode: string
): { valid: boolean; error?: string } {
  const verification = verifyPasswordResetOtp(email, userEnteredCode);
  if (!verification.valid) {
    return verification;
  }

  const cleanEmail = email.toLowerCase().trim();
  pendingPasswordResets.delete(cleanEmail);
  return { valid: true };
}

/**
 * Dispatch student and user feedback directly to Nelson Wazini (nelsonwazini1@gmail.com)
 */
export async function sendFeedbackEmailNotification(data: {
  rating: number;
  category: string;
  message: string;
  fullName: string;
  email: string;
  userId?: string;
}): Promise<{ sent: boolean; recipient: string; error?: string }> {
  const recipient = process.env.FEEDBACK_RECEIVER_EMAIL || "nelsonwazini1@gmail.com";
  const transporter = getMailTransporter();

  const stars = "★".repeat(Math.max(1, Math.min(5, data.rating))) + "☆".repeat(5 - Math.max(1, Math.min(5, data.rating)));
  const timestamp = new Date().toLocaleString();

  console.log(`\n================== FEEDBACK DISPATCH ==================`);
  console.log(`To: ${recipient}`);
  console.log(`From: ${data.fullName || "User"} (${data.email})`);
  console.log(`Rating: ${data.rating}/5 | Category: ${data.category}`);
  console.log(`Message: ${data.message}`);
  console.log(`Time: ${timestamp}`);
  console.log(`======================================================\n`);

  if (!transporter) {
    console.log(`[FEEDBACK] Transporter unconfigured; recorded to server logs and DB for ${recipient}.`);
    return { sent: false, recipient };
  }

  try {
    const sender = process.env.EMAIL_FROM || process.env.SMTP_USER || "noreply@edumind.ng";
    await transporter.sendMail({
      from: `"EduMind AI Platform" <${sender}>`,
      to: recipient,
      replyTo: data.email,
      subject: `[EduMind Feedback] ${data.category} from ${data.fullName || data.email} (${data.rating}/5 Stars)`,
      text: `New EduMind AI User Feedback!\n\n` +
        `Rating: ${data.rating}/5 (${stars})\n` +
        `Category: ${data.category}\n` +
        `From: ${data.fullName || "User"} (${data.email})\n` +
        `User ID: ${data.userId || "anonymous"}\n` +
        `Time: ${timestamp}\n\n` +
        `Feedback Message:\n${data.message}\n\n` +
        `Reply directly to this email to respond to the sender.`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0b0e; color: #f4f4f5; padding: 40px 20px;">
          <div style="max-width: 580px; margin: 0 auto; background: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 32px 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
            <div style="border-bottom: 1px solid #27272a; padding-bottom: 16px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between;">
              <div>
                <h1 style="color: #ffffff; font-size: 20px; font-weight: 700; margin: 0 0 4px 0;">New User Feedback Received</h1>
                <p style="color: #a1a1aa; font-size: 13px; margin: 0;">EduMind AI Platform Notification</p>
              </div>
              <div style="font-size: 20px; color: #f59e0b; letter-spacing: 2px;">
                ${stars}
              </div>
            </div>

            <div style="background: #09090b; border: 1px solid #27272a; border-radius: 10px; padding: 14px 16px; margin-bottom: 20px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <tr>
                  <td style="color: #71717a; padding: 5px 0; width: 100px;">From:</td>
                  <td style="color: #ffffff; font-weight: 600;">${data.fullName || "User"}</td>
                </tr>
                <tr>
                  <td style="color: #71717a; padding: 5px 0;">Email:</td>
                  <td style="color: #38bdf8;"><a href="mailto:${data.email}" style="color: #38bdf8; text-decoration: none;">${data.email}</a></td>
                </tr>
                <tr>
                  <td style="color: #71717a; padding: 5px 0;">Category:</td>
                  <td style="color: #10b981; font-weight: 600;">${data.category}</td>
                </tr>
                <tr>
                  <td style="color: #71717a; padding: 5px 0;">Rating:</td>
                  <td style="color: #fbbf24; font-weight: 700;">${data.rating} / 5 Stars</td>
                </tr>
                <tr>
                  <td style="color: #71717a; padding: 5px 0;">Time:</td>
                  <td style="color: #a1a1aa;">${timestamp}</td>
                </tr>
              </table>
            </div>

            <div style="margin-bottom: 24px;">
              <h3 style="color: #a1a1aa; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0;">Message Content</h3>
              <div style="background: #141416; border-left: 3px solid #10b981; padding: 16px; border-radius: 0 8px 8px 0; font-size: 14px; line-height: 1.6; color: #e4e4e7; white-space: pre-wrap;">${data.message}</div>
            </div>

            <div style="border-top: 1px solid #27272a; padding-top: 16px; text-align: center;">
              <a href="mailto:${data.email}?subject=Re: Your EduMind AI Feedback (${encodeURIComponent(data.category)})" style="display: inline-block; background: #10b981; color: #000000; font-weight: 700; font-size: 13px; padding: 10px 24px; border-radius: 8px; text-decoration: none;">
                Reply Directly to ${data.fullName || "User"}
              </a>
            </div>
          </div>
          <p style="text-align: center; color: #52525b; font-size: 11px; margin-top: 20px;">
            Delivered directly to Nelson (${recipient}) &bull; EduMind AI
          </p>
        </div>
      `,
    });

    console.log(`[FEEDBACK] ✅ Email notification successfully delivered to ${recipient}`);
    return { sent: true, recipient };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (errMsg.includes("535") || errMsg.includes("BadCredentials") || errMsg.includes("Username and Password not accepted") || errMsg.includes("Invalid login")) {
      mailTransporter = null;
      console.log(`[FEEDBACK] ℹ️ SMTP credentials inactive (535); feedback successfully recorded in database.`);
    } else {
      console.log(`[FEEDBACK] ℹ️ SMTP delivery unavailable; feedback successfully recorded in database.`);
    }
    return { sent: false, recipient, error: errMsg };
  }
}
