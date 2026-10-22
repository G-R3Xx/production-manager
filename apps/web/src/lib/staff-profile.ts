import { z } from "zod";

export const staffProfileNamesSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required.").max(200, "Full name must be 200 characters or fewer.")
    .refine((value) => !value.includes("@"), "Enter a full name rather than an email address."),
  shortName: z.string().trim().min(1, "Short name is required.").max(50, "Short name must be 50 characters or fewer.")
    .refine((value) => !value.includes("@"), "Enter a short name rather than an email address."),
});
