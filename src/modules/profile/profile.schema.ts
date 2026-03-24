import { z } from 'zod';

const NEPAL_PHONE_REGEX = /^\+977-\d{10}$/;

// ─── Update Profile ───────────────────────────────────────

export const updateProfileSchema = z
  .object({
    fullName: z
      .string()
      .min(2, 'Full name must be at least 2 characters')
      .max(255, 'Full name must be at most 255 characters')
      .transform((v) => v.trim())
      .optional(),
    phoneNumber: z
      .string()
      .regex(
        NEPAL_PHONE_REGEX,
        'Phone number must be in Nepal format: +977-XXXXXXXXXX',
      )
      .optional(),
  })
  .refine((data) => data.fullName || data.phoneNumber, {
    message: 'At least one field (fullName or phoneNumber) must be provided',
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ─── Change Password ─────────────────────────────────────

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(128, 'New password must be at most 128 characters'),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
