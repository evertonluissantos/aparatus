import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { resolve } from "node:path";
import { readRemoteEnvironment, verifyAuthorization, verifyNeonIdentity, verifyEmptyRemoteDatabase, verifyBranchIdentity } from "./neon/identity.mjs";
import { validateOfflineConfiguration } from "./neon/preflight.mjs";
import { safeInspectionDiagnostic, inspectionFailure } from "./neon/inspection-diagnostics.mjs";

const now=new Date("2026-11-07T12:00:00Z");
const hostname="ep-synthetic-test.us-east-2.aws.neon.tech";
const env=()=>({CORTZ_ALLOW_REMOTE_TESTS:"neon-disposable",CORTZ_TEST_PROJECT_ID:"test-project",CORTZ_TEST_NEON_API_KEY:"synthetic-management-key",CORTZ_NEON_AUTHORIZATION_FILE:resolve("tests/synthetic-authorization.json"),CORTZ_TEST_DATABASE_URL:`postgresql://cortz_test_role:synthetic-password@${hostname}/cortz_test_db?sslmode=verify-full`});
const code=(expected)=>(error)=>error.name==="NeonSafetyError"&&error.message===expected;

test("Neon diagnostics: arbitrary error messages, codes, stages and nested secrets never reach logs",()=>{
  const secret="postgresql://user:synthetic-password@private.invalid/db";
  for(const error of [new Error(secret),{code:secret,message:secret,cause:{code:secret}},{name:"NeonSafetyError",message:secret}]){
    const output=safeInspectionDiagnostic(secret,error);
    assert.equal(output,"NEON_READONLY_INSPECTION_FAILED: stage=unknown code=UNCLASSIFIED_FAILURE");
    assert.equal(output.includes(secret),false);
  }
});
test("Neon diagnostics: API, PostgreSQL, nested TLS and internal errors have safe distinct classifications",()=>{
  for(const [stage,error,expected] of [
    ["configuration",inspectionFailure("CREDENTIALS_MISSING"),"CREDENTIALS_MISSING"],
    ["api_branch",{name:"NeonSafetyError",message:"NEON_BRANCH_UNVERIFIED"},"NEON_BRANCH_UNVERIFIED"],
    ["sql_connect",{code:"28P01",message:"sensitive"},"28P01"],
    ["api_project",{cause:{code:"ERR_TLS_CERT_ALTNAME_INVALID",message:"sensitive"}},"ERR_TLS_CERT_ALTNAME_INVALID"],
    ["role_catalog",inspectionFailure("ROLE_MEMBERSHIP_REJECTED"),"ROLE_MEMBERSHIP_REJECTED"],
    ["local_files",new SyntaxError("sensitive"),"INVALID_JSON_OR_SYNTAX"],
    ["api_endpoint",new TypeError("sensitive"),"INVALID_SHAPE_OR_INTERNAL_TYPE_ERROR"],
  ])assert.equal(safeInspectionDiagnostic(stage,error),`NEON_READONLY_INSPECTION_FAILED: stage=${stage} code=${expected}`);
});
function signed(overrides={}) {
  const {publicKey,privateKey}=generateKeyPairSync("ed25519");
  const manifest={version:1,purpose:"cortz-neon-disposable-tests",authorizationId:"synthetic-run",projectId:"test-project",organizationId:"test-org",branchId:"br-synthetic",endpointId:"ep-synthetic-test",hostname,database:"cortz_test_db",role:"cortz_test_role",independentEmptyBranch:true,allowCreateTestSchema:true,allowTestExtensions:true,cleanup:"manual-branch-review",issuedAt:"2026-11-07T11:00:00Z",expiresAt:"2026-11-07T13:00:00Z",...overrides};
  const bytes=Buffer.from(JSON.stringify(manifest));
  return {manifest,remote:readRemoteEnvironment(env()),trust:{version:1,authorizers:[{keyId:"test-key",publicKeyPem:publicKey.export({type:"spki",format:"pem"}),organizationId:"test-org",allowedTestProjectIds:["test-project"],forbiddenProjectIds:["real-project"]}]},envelope:{keyId:"test-key",payloadBase64:bytes.toString("base64url"),signatureBase64:sign(null,bytes,privateKey).toString("base64url")}};
}

test("Neon safety: configuration is explicit and TLS cannot be disabled",()=>{
  const remote=readRemoteEnvironment(env());
  assert.equal(remote.connection.ssl.rejectUnauthorized,true);
  assert.equal(remote.connection.ssl.servername,hostname);
  for(const field of Object.keys(env())) {const input=env();delete input[field];assert.throws(()=>readRemoteEnvironment(input));}
  for(const name of ["DATABASE_URL","TEST_DATABASE_URL","PGHOST","NODE_OPTIONS","NODE_TLS_REJECT_UNAUTHORIZED","DOTENV_CONFIG_PATH"])assert.throws(()=>readRemoteEnvironment({...env(),[name]:"unsafe"}),code("IMPLICIT_CONFIGURATION_REJECTED"));
});
test("Neon safety: localhost, poolers, ambiguous URL parameters and insecure TLS are rejected",()=>{
  for(const url of [
    "postgresql://user:synthetic@localhost/cortz_test_db?sslmode=verify-full",
    "postgresql://user:synthetic@127.0.0.1/cortz_test_db?sslmode=verify-full",
    `postgresql://user:synthetic@ep-synthetic-test-pooler.us-east-2.aws.neon.tech/cortz_test_db?sslmode=verify-full`,
    `postgresql://user:synthetic@${hostname}/cortz_test_db?sslmode=require`,
    `postgresql://user:synthetic@${hostname}/cortz_test_db?sslmode=verify-full&host=real.example.invalid`,
    `postgresql://user:synthetic@${hostname}/application?sslmode=verify-full`,
  ])assert.throws(()=>readRemoteEnvironment({...env(),CORTZ_TEST_DATABASE_URL:url}));
});
test("Neon safety: project ID or database name alone never authorizes execution",()=>{
  const f=signed();
  assert.throws(()=>verifyAuthorization(f.envelope,{version:1,authorizers:[]},f.remote,now),code("PROJECT_NOT_TRUSTED"));
  assert.throws(()=>verifyAuthorization(f.envelope,{...f.trust,authorizers:[{...f.trust.authorizers[0],forbiddenProjectIds:[]}]},f.remote,now),code("PROJECT_NOT_TRUSTED"));
});
test("Neon safety: verified signature and independently pinned allowlist agree",()=>{
  const f=signed();
  assert.equal(verifyAuthorization(f.envelope,f.trust,f.remote,now).projectId,"test-project");
  const denied={...f.trust,authorizers:[{...f.trust.authorizers[0],forbiddenProjectIds:["test-project","real-project"]}]};
  assert.throws(()=>verifyAuthorization(f.envelope,denied,f.remote,now),code("PROJECT_NOT_AUTHORIZED"));
});
test("Neon safety: tampered, expired, excessive duration and mismatched scope are rejected",()=>{
  const f=signed();const changed={...f.envelope,payloadBase64:Buffer.from(JSON.stringify({...f.manifest,projectId:"real-project"})).toString("base64url")};
  assert.throws(()=>verifyAuthorization(changed,f.trust,f.remote,now),code("AUTHORIZATION_SIGNATURE_INVALID"));
  for(const changes of [{expiresAt:"2026-11-07T11:30:00Z"},{expiresAt:"2026-11-09T11:30:00Z"},{hostname:"ep-real.us-east-2.aws.neon.tech"},{cleanup:"drop-database"},{independentEmptyBranch:false},{role:"another-role"}]){
    const x=signed(changes);assert.throws(()=>verifyAuthorization(x.envelope,x.trust,x.remote,now));
  }
});
function fakeApi(f,modify=()=>{}) {
  const objects=[{project:{id:"test-project",org_id:"test-org"}},{branch:{id:"br-synthetic",project_id:"test-project",parent_id:null}},{endpoint:{id:"ep-synthetic-test",project_id:"test-project",branch_id:"br-synthetic",host:hostname,type:"read_write"}}];
  modify(objects);const calls=[];
  return {calls,fetcher:async(url,options)=>{
    calls.push(url);assert.equal(options.method,"GET");assert.equal(options.redirect,"error");
    assert.ok(url.startsWith("https://console.neon.tech/api/v2/projects/test-project"));
    assert.equal(options.headers.Authorization,`Bearer ${f.remote.apiKey}`);
    return {ok:true,json:async()=>objects[calls.length-1]};
  }};
}
test("Neon safety: API verification uses only authorized project and read-only requests (fake HTTP)",async()=>{
  const f=signed();const api=fakeApi(f);
  assert.equal((await verifyNeonIdentity(f.remote,f.manifest,api.fetcher)).branchId,"br-synthetic");
  assert.equal(api.calls.length,3);
});
test("Neon safety: API mismatch, copied branch or missing identity aborts (fake HTTP)",async()=>{
  for(const change of [(rows)=>{rows[0].project.id="real-project";},(rows)=>{rows[1].branch.parent_id="br-existing";},(rows)=>{delete rows[1].branch.project_id;},(rows)=>{rows[2].endpoint.branch_id="br-other";},(rows)=>{rows[2].endpoint.host="ep-real.us-east-2.aws.neon.tech";}]){
    const f=signed();const api=fakeApi(f,change);
    await assert.rejects(verifyNeonIdentity(f.remote,f.manifest,api.fetcher));
  }
});
function databaseFixture({relations=0,extensions=0,memberships=0,superuser=false,locked=true}={}) {
  const calls=[];let released=false;
  const schema=`cortz_run_${"a".repeat(32)}`;
  const connection={release:()=>{released=true;},query:async(sql)=>{
    calls.push(sql);
    if(sql.includes("pg_try_advisory"))return {rows:[{locked}]};
    if(sql.includes("current_database"))return {rows:[{db:"cortz_test_db",usr:"cortz_test_role",rolsuper:superuser,rolcreaterole:false,rolcreatedb:false}]};
    if(sql.includes("pg_auth_members"))return {rows:[{count:memberships}]};
    if(sql.includes("pg_class"))return {rows:[{count:relations}]};
    if(sql.includes("pg_extension"))return {rows:[{count:extensions}]};
    if(sql.includes("current_schema"))return {rows:[{name:schema}]};
    return {rows:[]};
  }};
  return {pool:{connect:async()=>connection},calls,schema,get released(){return released;}};
}
test("Neon safety: nonempty database, existing extension, privileged role or competing run never reaches DDL (fake SQL)",async()=>{
  for(const options of [{relations:1},{extensions:1},{memberships:1},{superuser:true},{locked:false}]){
    const f=databaseFixture(options);
    await assert.rejects(verifyEmptyRemoteDatabase(f.pool,{database:"cortz_test_db",user:"cortz_test_role"},f.schema));
    assert.equal(f.calls.some((sql)=>sql.startsWith("CREATE")),false);assert.equal(f.released,true);
  }
});

test("Neon offline: complete signed configuration succeeds using only local JSON reads",()=>{
  const f=signed();const reads=[];
  const reader=(path)=>{reads.push(String(path));return JSON.stringify(path instanceof URL?f.trust:f.envelope);};
  assert.equal(validateOfflineConfiguration(env(),reader,now).manifest.projectId,"test-project");
  assert.equal(reads.length,2);
  assert.throws(()=>validateOfflineConfiguration(env(),()=>"null",now));
  assert.throws(()=>validateOfflineConfiguration(env(),()=>{throw new Error("synthetic secret");},now),code("TRUST_FILE_INVALID"));
  f.trust.authorizers[0].publicKeyPem="invalid";
  assert.throws(()=>validateOfflineConfiguration(env(),reader,now),code("TRUST_KEY_INVALID"));
});

test("Neon safety: literal pg_ prefix and all relation kinds are checked (catalog query regression)",async()=>{
  const f=databaseFixture();const release=await verifyEmptyRemoteDatabase(f.pool,{database:"cortz_test_db",user:"cortz_test_role"},f.schema);
  const sql=f.calls.find((query)=>query.includes("pg_class"));
  assert.ok(sql.includes("n.nspname !~ '^pg_'"));
  assert.equal(/^pg_/.test("pgx"),false);
  assert.equal(/^pg_/.test("pg_catalog"),true);
  assert.equal(/LIKE|relkind/.test(sql),false);
  for(const catalog of ["pg_namespace","pg_class","pg_proc","pg_type","pg_operator","pg_collation","pg_foreign_server","pg_foreign_data_wrapper","pg_publication","pg_largeobject_metadata"])assert.ok(sql.includes(catalog));
  await release();
});
test("Neon safety: pristine proof precedes isolated schema creation; no automatic DROP (fake SQL)",async()=>{
  const f=databaseFixture();
  const release=await verifyEmptyRemoteDatabase(f.pool,{database:"cortz_test_db",user:"cortz_test_role"},f.schema);
  assert.ok(f.calls.findIndex((sql)=>sql.includes("pg_class"))<f.calls.findIndex((sql)=>sql.startsWith("CREATE SCHEMA")));
  assert.equal(f.calls.some((sql)=>/DROP|TRUNCATE/.test(sql)),false);
  assert.equal(f.released,false);await release();assert.equal(f.released,true);
});

test("Neon offline: network and subprocess attempts are blocked before I/O",async()=>{
  await import("./neon/offline-guard.mjs");
  const net=await import("node:net");const tls=await import("node:tls");
  const dns=await import("node:dns");const cp=await import("node:child_process");
  for(const attempt of [()=>fetch("https://example.invalid"),()=>net.connect(5432,"example.invalid"),()=>tls.connect(5432,"example.invalid"),()=>dns.lookup("example.invalid",()=>{}),()=>cp.spawn("unused")])assert.throws(attempt,/External I\/O blocked/);
});

test("Neon branch: missing, mismatched, malformed and explicit parent metadata are distinguished offline",()=>{
  const manifest={branchId:"br-fictional",projectId:"test-project"};
  const valid={id:manifest.branchId,project_id:manifest.projectId,parent_id:null};
  assert.deepEqual(verifyBranchIdentity({branch:valid},manifest),valid);
  const cases=[
    [null,"NEON_BRANCH_RESPONSE_INCOMPATIBLE"],
    [{},"NEON_BRANCH_RESPONSE_INCOMPATIBLE"],
    [{branch:null},"NEON_BRANCH_RESPONSE_INCOMPATIBLE"],
    [{branch:[]},"NEON_BRANCH_RESPONSE_INCOMPATIBLE"],
    [{branch:{...valid,id:undefined}},"NEON_BRANCH_ID_INVALID"],
    [{branch:{...valid,id:"br-other"}},"NEON_BRANCH_ID_MISMATCH"],
    [{branch:{...valid,project_id:"sparkling-union-52245638"}},"NEON_BRANCH_PROJECT_ID_MISMATCH"],
    [{branch:{...valid,project_id:null}},"NEON_BRANCH_PROJECT_ID_INVALID"],
    [{branch:{...valid,parent_id:"br-parent"}},"NEON_BRANCH_HAS_PARENT"],
    ...[undefined,"",false,0,{},[]].map(parent_id=>[{branch:{...valid,parent_id}},"NEON_BRANCH_PARENT_ID_INVALID"]),
  ];
  for(const [field,expected] of [["id","NEON_BRANCH_ID_MISSING"],["project_id","NEON_BRANCH_PROJECT_ID_MISSING"],["parent_id","NEON_BRANCH_PARENT_ID_MISSING"]]){
    const branch={...valid};delete branch[field];cases.push([{branch},expected]);
  }
  for(const [response,expected] of cases){
    assert.throws(()=>verifyBranchIdentity(response,manifest),(error)=>{
      assert.equal(safeInspectionDiagnostic("api_branch",error),`NEON_READONLY_INSPECTION_FAILED: stage=api_branch code=${expected}`);
      return error.name==="NeonSafetyError"&&error.message===expected;
    });
  }
});
test("Neon branch: incomplete root evidence stops before endpoint lookup (fake HTTP)",async()=>{
  const f=signed();const api=fakeApi(f,(objects)=>{delete objects[1].branch.parent_id;});
  await assert.rejects(verifyNeonIdentity(f.remote,f.manifest,api.fetcher),code("NEON_BRANCH_PARENT_ID_MISSING"));
  assert.equal(api.calls.length,2);
});

test("Neon branch: read-only migration inspection accepts optional root parent without mutating evidence",()=>{
  const manifest={branchId:"br-fictional",projectId:"test-project"};
  const root={id:manifest.branchId,project_id:manifest.projectId};
  const options={allowOmittedRootParent:true};
  assert.equal(verifyBranchIdentity({branch:root},manifest,options),root);
  assert.equal(Object.hasOwn(root,"parent_id"),false);
  assert.equal(verifyBranchIdentity({branch:{...root,parent_id:null}},manifest,options).parent_id,null);
  assert.throws(()=>verifyBranchIdentity({branch:root},manifest),code("NEON_BRANCH_PARENT_ID_MISSING"));
  for(const value of [undefined,"",false,0,{},[]])
    assert.throws(()=>verifyBranchIdentity({branch:{...root,parent_id:value}},manifest,options),code("NEON_BRANCH_PARENT_ID_INVALID"));
  assert.throws(()=>verifyBranchIdentity({branch:{...root,parent_id:"br-parent"}},manifest,options),code("NEON_BRANCH_HAS_PARENT"));
  for(const field of ["parent_lsn","parent_timestamp"])
    assert.throws(()=>verifyBranchIdentity({branch:{...root,[field]:"synthetic"}},manifest,options),code("NEON_BRANCH_PARENT_ID_MISSING"));
  assert.throws(()=>verifyBranchIdentity({branch:{...root,id:"br-other"}},manifest,options),code("NEON_BRANCH_ID_MISMATCH"));
  assert.throws(()=>verifyBranchIdentity({branch:{...root,project_id:"sparkling-union-52245638"}},manifest,options),code("NEON_BRANCH_PROJECT_ID_MISMATCH"));
  for(const field of ["id","project_id"]){const incomplete={...root};delete incomplete[field];assert.throws(()=>verifyBranchIdentity({branch:incomplete},manifest,options));}
});

test("Neon branch: optional root format still requires verified project and endpoint before SQL (fake HTTP)",async()=>{
  const f=signed();
  const options={allowOmittedRootParent:true};
  const api=fakeApi(f,objects=>{delete objects[1].branch.parent_id;});
  assert.equal((await verifyNeonIdentity(f.remote,f.manifest,api.fetcher,options)).branchId,f.manifest.branchId);
  assert.equal(api.calls.length,3);
  for(const change of [
    objects=>{objects[0].project.id="sparkling-union-52245638";},
    objects=>{objects[0].project.org_id="other-org";},
    objects=>{objects[1].branch.id="br-other";},
    objects=>{objects[2].endpoint.id="ep-other";},
    objects=>{objects[2].endpoint.branch_id="br-other";},
    objects=>{objects[2].endpoint.project_id="sparkling-union-52245638";},
    objects=>{objects[2].endpoint.host="ep-other.invalid";},
    objects=>{objects[2].endpoint.type="read_only";},
  ]) {
    const bad=fakeApi(f,objects=>{delete objects[1].branch.parent_id;change(objects);});
    await assert.rejects(verifyNeonIdentity(f.remote,f.manifest,bad.fetcher,options));
  }
});
