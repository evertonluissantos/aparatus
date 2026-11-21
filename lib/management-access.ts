import "server-only";
import {
  OWNER_AUTH_ENABLED,
  disabledManagementAccess,
} from "./owner-auth-policy";

export async function managementAccess(area: "owner" | "global") {
  if (area !== "owner" && area !== "global") return "forbidden";
  if (!OWNER_AUTH_ENABLED)
    return disabledManagementAccess(process.env.NODE_ENV);
  // Disabled rollout never even imports database/auth dependencies.
  const authorization = await import("./authorization").catch(() => null);
  if (!authorization) return "unavailable";
  const {
    requireOwnerPanelAccess,
    requireGlobalPermission,
    AuthorizationError,
  } = authorization;
  try {
    if (area === "global") await requireGlobalPermission("subscriptions:read");
    else await requireOwnerPanelAccess();
    return "authorized";
  } catch (error) {
    if (error instanceof AuthorizationError)
      return error.code === "UNAUTHENTICATED" ? "login" : "forbidden";
    // Missing tables, unavailable session/database, etc. never allow access.
    return "unavailable";
  }
}
