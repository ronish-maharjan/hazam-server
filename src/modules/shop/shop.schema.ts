import { z } from 'zod';

const NEPAL_PHONE_REGEX = /^\+977-\d{10}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// ─── Working Hours ────────────────────────────────────────

const dayHoursSchema = z.object({
  open: z
    .string()
    .regex(TIME_REGEX, 'Open time must be in HH:MM 24-hour format'),
  close: z
    .string()
    .regex(TIME_REGEX, 'Close time must be in HH:MM 24-hour format'),
  isClosed: z.boolean(),
}).refine(
  (data) => {
    if (data.isClosed) return true;
    return data.open < data.close;
  },
  { message: 'Open time must be before close time' },
);

const DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

const workingHoursSchema = z.object({
  monday: dayHoursSchema,
  tuesday: dayHoursSchema,
  wednesday: dayHoursSchema,
  thursday: dayHoursSchema,
  friday: dayHoursSchema,
  saturday: dayHoursSchema,
  sunday: dayHoursSchema,
});

// ─── Create Shop ──────────────────────────────────────────

export const createShopSchema = z.object({
  shopName: z
    .string()
    .min(2, 'Shop name must be at least 2 characters')
    .max(255, 'Shop name must be at most 255 characters')
    .transform((v) => v.trim()),
  shopPhoneNumber: z
    .string()
    .regex(NEPAL_PHONE_REGEX, 'Phone number must be in Nepal format: +977-XXXXXXXXXX'),
  latitude: z
    .number()
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90'),
  longitude: z
    .number()
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180'),
  numberOfBarbers: z
    .number()
    .int('Number of barbers must be a whole number')
    .min(1, 'Must have at least 1 barber')
    .max(50, 'Maximum 50 barbers per shop')
    .default(1),
  workingHours: workingHoursSchema,
});

export type CreateShopInput = z.infer<typeof createShopSchema>;

// ─── Update Shop ──────────────────────────────────────────

export const updateShopSchema = z
  .object({
    shopName: z
      .string()
      .min(2, 'Shop name must be at least 2 characters')
      .max(255, 'Shop name must be at most 255 characters')
      .transform((v) => v.trim())
      .optional(),
    shopPhoneNumber: z
      .string()
      .regex(NEPAL_PHONE_REGEX, 'Phone number must be in Nepal format: +977-XXXXXXXXXX')
      .optional(),
    latitude: z
      .number()
      .min(-90, 'Latitude must be between -90 and 90')
      .max(90, 'Latitude must be between -90 and 90')
      .optional(),
    longitude: z
      .number()
      .min(-180, 'Longitude must be between -180 and 180')
      .max(180, 'Longitude must be between -180 and 180')
      .optional(),
    numberOfBarbers: z
      .number()
      .int('Number of barbers must be a whole number')
      .min(1, 'Must have at least 1 barber')
      .max(50, 'Maximum 50 barbers per shop')
      .optional(),
    workingHours: workingHoursSchema.optional(),
  })
  .refine(
    (data) => Object.values(data).some((v) => v !== undefined),
    { message: 'At least one field must be provided' },
  );

export type UpdateShopInput = z.infer<typeof updateShopSchema>;

// ─── Toggle Shop Status ──────────────────────────────────

export const toggleShopStatusSchema = z.object({
  isActive: z.boolean({ required_error: 'isActive is required' }),
});

export type ToggleShopStatusInput = z.infer<typeof toggleShopStatusSchema>;

// ─── Add Service ──────────────────────────────────────────

export const addServiceSchema = z.object({
  serviceName: z
    .string()
    .min(2, 'Service name must be at least 2 characters')
    .max(255, 'Service name must be at most 255 characters')
    .transform((v) => v.trim()),
  price: z
    .number()
    .positive('Price must be greater than 0')
    .max(99999999.99, 'Price is too large'),
  durationMinutes: z
    .number()
    .int('Duration must be a whole number')
    .min(5, 'Duration must be at least 5 minutes')
    .max(480, 'Duration must be at most 480 minutes (8 hours)'),
});

export type AddServiceInput = z.infer<typeof addServiceSchema>;

// ─── Update Service ───────────────────────────────────────

export const updateServiceSchema = z
  .object({
    serviceName: z
      .string()
      .min(2, 'Service name must be at least 2 characters')
      .max(255, 'Service name must be at most 255 characters')
      .transform((v) => v.trim())
      .optional(),
    price: z
      .number()
      .positive('Price must be greater than 0')
      .max(99999999.99, 'Price is too large')
      .optional(),
    durationMinutes: z
      .number()
      .int('Duration must be a whole number')
      .min(5, 'Duration must be at least 5 minutes')
      .max(480, 'Duration must be at most 480 minutes (8 hours)')
      .optional(),
  })
  .refine(
    (data) => Object.values(data).some((v) => v !== undefined),
    { message: 'At least one field must be provided' },
  );

export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

// ─── Service ID Param ─────────────────────────────────────

export const serviceIdParamSchema = z.object({
  serviceId: z.string().uuid('Invalid service ID'),
});

export type ServiceIdParam = z.infer<typeof serviceIdParamSchema>;
