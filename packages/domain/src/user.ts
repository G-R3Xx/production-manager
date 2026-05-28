import { z } from "zod";

export const globalRoleSchema = z.enum(["platform_admin", "user"]);

export const tenantRoleSchema = z.enum([
  "owner",
  "manager",
  "staff",
  "sales",
  "installer",
  "accounts"
]);

export const membershipStatusSchema = z.enum([
  "active",
  "invited",
  "disabled"
]);

export const userProfileSchema = z.object({
  id: z.string().uuid(),
  authUserId: z.string().uuid(),
  fullName: z.string().min(1).max(200),
  shortName: z.string().min(1).max(50),
  email: z.string().email(),
  globalRole: globalRoleSchema.default("user"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const membershipSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userProfileId: z.string().uuid(),
  tenantRole: tenantRoleSchema,
  status: membershipStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type GlobalRole = z.infer<typeof globalRoleSchema>;
export type TenantRole = z.infer<typeof tenantRoleSchema>;
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
export type Membership = z.infer<typeof membershipSchema>;
