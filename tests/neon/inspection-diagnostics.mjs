// Only locally defined codes may reach logs, never error.message/cause/stack.
export const inspectionCodes = new Set([
  "CHANNEL_BINDING_REQUIRED",
  "NEON_BRANCH_RESPONSE_INCOMPATIBLE", "NEON_BRANCH_ID_MISSING", "NEON_BRANCH_ID_INVALID", "NEON_BRANCH_ID_MISMATCH",
  "NEON_BRANCH_PROJECT_ID_MISSING", "NEON_BRANCH_PROJECT_ID_INVALID", "NEON_BRANCH_PROJECT_ID_MISMATCH",
  "NEON_BRANCH_PARENT_ID_MISSING", "NEON_BRANCH_PARENT_ID_INVALID", "NEON_BRANCH_HAS_PARENT",
  "CONSENT_REQUIRED", "IMPLICIT_CONFIGURATION_REJECTED", "LOCAL_IDENTITY_REJECTED",
  "TRUST_STORE_REJECTED", "CREDENTIALS_MISSING", "URL_REJECTED", "ROLE_OR_DATABASE_URL_REJECTED",
  "DATABASE_IDENTITY_REJECTED", "READ_ONLY_NOT_ACTIVE", "PRIVILEGED_ROLE_REJECTED",
  "ROLE_MEMBERSHIP_REJECTED", "CREATE_PRIVILEGE_MISSING", "USER_OBJECTS_PRESENT",
  "NEON_PROJECT_UNVERIFIED", "NEON_BRANCH_UNVERIFIED", "NEON_ENDPOINT_UNVERIFIED",
  "NEON_IDENTITY_REQUEST_FAILED", "28P01", "28000", "3D000", "42501", "42703", "42P01", "57014",
  "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT",
  "ERR_TLS_CERT_ALTNAME_INVALID", "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
]);
export function inspectionFailure(code) {
  const error = new Error(); error.code = code; return error;
}
export function safeInspectionDiagnostic(stage, error) {
  const stages = new Set(["configuration", "local_files", "url", "api_project", "api_branch", "api_endpoint", "driver", "sql_connect", "read_only_begin", "role_catalog", "object_catalog", "rollback", "disconnect"]);
  const code = inspectionCodes.has(error?.code) ? error.code
    : error?.name === "NeonSafetyError" && inspectionCodes.has(error.message) ? error.message
    : inspectionCodes.has(error?.cause?.code) ? error.cause.code
    : error?.name === "SyntaxError" ? "INVALID_JSON_OR_SYNTAX"
    : error?.name === "TypeError" ? "INVALID_SHAPE_OR_INTERNAL_TYPE_ERROR"
    : error?.name === "TimeoutError" || error?.name === "AbortError" ? "REQUEST_TIMEOUT_OR_ABORT"
    : error?.message === "External I/O blocked in isolated Neon tests" ? "NETWORK_GUARD_REJECTED"
    : "UNCLASSIFIED_FAILURE";
  return `NEON_READONLY_INSPECTION_FAILED: stage=${stages.has(stage) ? stage : "unknown"} code=${code}`;
}
