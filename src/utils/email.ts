import nodemailer from 'nodemailer';
import type { SendMailOptions } from 'nodemailer';
import { env } from '../config/env';
import { logger } from './logger';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  const mailOptions: SendMailOptions = {
    from: `"Hazam" <${env.SMTP_FROM}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
  };

  if (env.NODE_ENV === 'test') {
    logger.debug({ to: options.to, subject: options.subject }, 'Email suppressed in test');
    return;
  }

  try {
    await transporter.sendMail(mailOptions);
    logger.info({ to: options.to, subject: options.subject }, 'Email sent');
  } catch (error) {
    logger.error({ error, to: options.to }, 'Failed to send email');
    throw error;
  }
}

// ─── Email Templates ─────────────────────────────────────

export function emailVerificationTemplate(
  fullName: string,
  code: string,
): { subject: string; html: string } {
  return {
    subject: 'Hazam — Verify Your Email',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Welcome to Hazam, ${fullName}!</h2>
        <p>Your verification code is:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px;
                    background: #f4f4f4; padding: 16px; text-align: center;
                    border-radius: 8px; margin: 16px 0;">
          ${code}
        </div>
        <p>This code expires in <strong>15 minutes</strong>.</p>
        <p>If you didn't create an account, ignore this email.</p>
      </div>
    `,
  };
}

export function passwordResetTemplate(
  fullName: string,
  code: string,
): { subject: string; html: string } {
  return {
    subject: 'Hazam — Reset Your Password',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>Hi ${fullName}, your password reset code is:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px;
                    background: #f4f4f4; padding: 16px; text-align: center;
                    border-radius: 8px; margin: 16px 0;">
          ${code}
        </div>
        <p>This code expires in <strong>1 hour</strong>.</p>
        <p>If you didn't request this, ignore this email.</p>
      </div>
    `,
  };
}

export function bookingCreatedCustomerTemplate(
  customerName: string,
  shopName: string,
  serviceName: string,
  date: string,
  time: string,
): { subject: string; html: string } {
  return {
    subject: 'Hazam — Booking Created',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Booking Created!</h2>
        <p>Hi ${customerName}, your booking is pending confirmation.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; font-weight: bold;">Shop</td><td style="padding: 8px;">${shopName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Service</td><td style="padding: 8px;">${serviceName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Date</td><td style="padding: 8px;">${date}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Time</td><td style="padding: 8px;">${time}</td></tr>
        </table>
        <p>You'll receive an email once the barber confirms.</p>
      </div>
    `,
  };
}

export function bookingCreatedBarberTemplate(
  barberName: string,
  customerName: string,
  serviceName: string,
  date: string,
  time: string,
): { subject: string; html: string } {
  return {
    subject: 'Hazam — New Booking Received',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>New Booking!</h2>
        <p>Hi ${barberName}, you have a new booking request.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; font-weight: bold;">Customer</td><td style="padding: 8px;">${customerName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Service</td><td style="padding: 8px;">${serviceName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Date</td><td style="padding: 8px;">${date}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Time</td><td style="padding: 8px;">${time}</td></tr>
        </table>
        <p>Please confirm or cancel from your dashboard.</p>
      </div>
    `,
  };
}

export function bookingConfirmedTemplate(
  customerName: string,
  shopName: string,
  serviceName: string,
  date: string,
  time: string,
): { subject: string; html: string } {
  return {
    subject: 'Hazam — Booking Confirmed',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Booking Confirmed! ✅</h2>
        <p>Hi ${customerName}, your booking has been confirmed.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; font-weight: bold;">Shop</td><td style="padding: 8px;">${shopName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Service</td><td style="padding: 8px;">${serviceName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Date</td><td style="padding: 8px;">${date}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Time</td><td style="padding: 8px;">${time}</td></tr>
        </table>
        <p>The service amount has been deducted from your wallet.</p>
      </div>
    `,
  };
}

export function bookingCancelledTemplate(
  customerName: string,
  shopName: string,
  serviceName: string,
  date: string,
  time: string,
  refunded: boolean,
): { subject: string; html: string } {
  return {
    subject: 'Hazam — Booking Cancelled',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Booking Cancelled</h2>
        <p>Hi ${customerName}, your booking has been cancelled by the barber.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; font-weight: bold;">Shop</td><td style="padding: 8px;">${shopName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Service</td><td style="padding: 8px;">${serviceName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Date</td><td style="padding: 8px;">${date}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Time</td><td style="padding: 8px;">${time}</td></tr>
        </table>
        ${refunded ? '<p><strong>A refund has been credited to your wallet.</strong></p>' : ''}
      </div>
    `,
  };
}
