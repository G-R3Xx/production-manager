import { z } from "zod";

const optionalString = z.string().trim().optional().transform((value) => {
  return value && value.length > 0 ? value : undefined;
});

const optionalUrl = z.string().trim().optional().transform((value, ctx) => {
  if (!value || value.length === 0) {
    return undefined;
  }

  try {
    new URL(value);
    return value;
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid url"
    });
    return z.NEVER;
  }
});

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().trim().min(1).default("Production Manager"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().trim().min(1)
});

const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  DATABASE_URL: optionalString,
  GOOGLE_CLOUD_PROJECT: optionalString,
  CLOUD_RUN_WORKER_BASE_URL: optionalUrl,
  CLOUD_TASKS_LOCATION: z.string().trim().min(1).default("australia-southeast1"),
  CLOUD_TASKS_QUEUE_DEFAULT: z.string().trim().min(1).default("default"),
  MYOB_CLIENT_ID: optionalString,
  MYOB_CLIENT_SECRET: optionalString,
  MYOB_REDIRECT_URI: optionalUrl,
  MYOB_API_BASE_URL: optionalUrl,
  MYOB_BUSINESS_API_BASE_URL: optionalUrl.default("https://api.myob.com/accountright"),
  RESEND_API_KEY: optionalString,
  PURCHASE_ORDER_FROM_EMAIL: optionalString,
  PURCHASE_ORDER_REPLY_TO: optionalString
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getPublicEnv(): PublicEnv {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  });
}

export function getServerEnv(): ServerEnv {
  return serverEnvSchema.parse({
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
    CLOUD_RUN_WORKER_BASE_URL: process.env.CLOUD_RUN_WORKER_BASE_URL,
    CLOUD_TASKS_LOCATION: process.env.CLOUD_TASKS_LOCATION,
    CLOUD_TASKS_QUEUE_DEFAULT: process.env.CLOUD_TASKS_QUEUE_DEFAULT,
    MYOB_CLIENT_ID: process.env.MYOB_CLIENT_ID,
    MYOB_CLIENT_SECRET: process.env.MYOB_CLIENT_SECRET,
    MYOB_REDIRECT_URI: process.env.MYOB_REDIRECT_URI,
    MYOB_API_BASE_URL: process.env.MYOB_API_BASE_URL,
    MYOB_BUSINESS_API_BASE_URL: process.env.MYOB_BUSINESS_API_BASE_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    PURCHASE_ORDER_FROM_EMAIL: process.env.PURCHASE_ORDER_FROM_EMAIL,
    PURCHASE_ORDER_REPLY_TO: process.env.PURCHASE_ORDER_REPLY_TO
  });
}

export const env = getServerEnv();
