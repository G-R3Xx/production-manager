import "server-only";

import { getMembershipsForAuthUserId } from "@/server/bootstrap/activeTenant";

export async function listMembershipsForAuthUser(authUserId: string) {
  return getMembershipsForAuthUserId(authUserId);
}
