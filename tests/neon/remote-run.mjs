import { readFileSync, writeFileSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { verifyNeonIdentity, NeonSafetyError } from "./identity.mjs";
import { validateOfflineConfiguration } from "./preflight.mjs";
import { generateIsolatedClient } from "./generate-client.mjs";

// No project/branch creation, arbitrary URL API requests, or remote DROP operations.
async function main() {
  if (process.env.CORTZ_EXECUTE_REMOTE_TESTS !== "execute-approved-neon-run") throw new NeonSafetyError("SEPARATE_REMOTE_EXECUTION_CONSENT_REQUIRED");
  const { remote, manifest } = validateOfflineConfiguration(process.env);
  const environment={};
  for(const key of ["SystemRoot","SYSTEMROOT","WINDIR","PATH","Path","TEMP","TMP"]) if(process.env[key])environment[key]=process.env[key];
  const parent=realpathSync(fileURLToPath(new URL("../",import.meta.url)));
  const root=mkdtempSync(join(parent,".neon-generated-"));
  const schema=`cortz_run_${randomUUID().replaceAll("-","")}`;
  writeFileSync(join(root,"owner.json"),JSON.stringify({schema,authorizationId:manifest.authorizationId}));
  try {
    generateIsolatedClient(root,environment);
    await verifyNeonIdentity(remote,manifest);
    writeFileSync(join(root,"owner.json"),JSON.stringify({schema,authorizationId:manifest.authorizationId,verifiedProjectId:manifest.projectId,verifiedAt:Date.now()}));
    const result=spawnSync(process.execPath,["--import","./tests/neon/guard.mjs","./tests/postgres/suite.mjs"],{
      env:{...environment,NODE_ENV:"test",CORTZ_TEST_MODE:"postgres-neon",CORTZ_ALLOW_REMOTE_TESTS:"neon-disposable",
        CORTZ_TEST_DATABASE_URL:remote.url,CORTZ_TEST_PROJECT_ID:remote.projectId,
        // Worker verifies signed scope locally; it must never call the management API.
        CORTZ_TEST_NEON_API_KEY:"worker-does-not-use-api",CORTZ_NEON_AUTHORIZATION_FILE:remote.authorizationFile,
        CORTZ_NEON_RUN_SCHEMA:schema,CORTZ_NEON_CLIENT_ROOT:root},
      encoding:"utf8",maxBuffer:16*1024*1024,timeout:180_000,windowsHide:true,
    });
    let output=(result.stdout??"")+(result.stderr??"");
    for(const secret of [remote.url,remote.connection.password,encodeURIComponent(remote.connection.password),remote.apiKey]) if(secret)output=output.split(secret).join("[REDACTED]");
    process.stdout.write(output);
    console.log(`Remote schema retained for manual review: ${schema}`);
    process.exitCode=result.error?1:result.status??1;
  } finally {
    const actual=realpathSync(root), marker=JSON.parse(readFileSync(join(root,"owner.json"),"utf8"));
    if(actual===root && actual.startsWith(join(parent,".neon-generated-")) && marker.schema===schema && marker.authorizationId===manifest.authorizationId) rmSync(actual,{recursive:true});
    else throw new Error("LOCAL_ARTIFACT_CLEANUP_REFUSED");
  }
}
main().catch((error)=>{ console.error(error instanceof NeonSafetyError ? error.message : "REMOTE_RUN_FAILED"); console.error("No automatic remote cleanup. Secrets are not logged."); process.exitCode=1; });
