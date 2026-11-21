import "./offline-guard.mjs";
import { validateOfflineConfiguration } from "./preflight.mjs";
import { NeonSafetyError } from "./identity.mjs";

try {
  validateOfflineConfiguration(process.env);
  console.log("NEON_OFFLINE_VALIDATION_OK: configuration/signature only; remote identity and database NOT checked.");
} catch (error) {
  console.error(`NEON_OFFLINE_VALIDATION_FAILED: ${error instanceof NeonSafetyError ? error.message : "OFFLINE_CONFIGURATION_INVALID"}`);
  process.exitCode = 1;
}
