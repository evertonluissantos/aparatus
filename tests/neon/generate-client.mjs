import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import { NeonSafetyError } from "./identity.mjs";

// Offline generation in a job-owned folder, never generated/prisma of runtime.
export function generateIsolatedClient(root, environment) {
  const source=readFileSync(new URL("../../prisma/schema.prisma",import.meta.url),"utf8");
  const generator=/generator client\s*\{[^}]*\}/;
  if (!generator.test(source)) throw new NeonSafetyError("GENERATOR_NOT_FOUND");
  const schema=source.replace(generator,`generator client {\n provider = "prisma-client"\n output = "./client"\n moduleFormat = "esm"\n importFileExtension = "js"\n engineType = "client"\n}`);
  writeFileSync(join(root,"schema.prisma"),schema);
  writeFileSync(join(root,"prisma.config.mjs"),`export default { schema: ${JSON.stringify(join(root,"schema.prisma"))} };\n`);
  const result=spawnSync(process.execPath,["--import","./tests/guard.mjs","./node_modules/prisma/build/index.js","generate","--config",join(root,"prisma.config.mjs"),"--no-hints"],{
    env:{...environment,NODE_ENV:"test",CORTZ_TEST_MODE:"mock-only",TZ:"UTC"},encoding:"utf8",timeout:30_000,windowsHide:true,
  });
  if (result.error || result.status!==0) throw new NeonSafetyError("ISOLATED_GENERATION_FAILED");
  function compile(directory) {
    for(const file of readdirSync(directory,{withFileTypes:true})) {
      const path=join(directory,file.name);
      if(file.isDirectory()) compile(path);
      else if(file.name.endsWith(".ts")) {
        const output=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022},fileName:path}).outputText;
        writeFileSync(path.slice(0,-3)+".js",output);
      }
    }
  }
  compile(join(root,"client"));
  writeFileSync(join(root,"package.json"),JSON.stringify({type:"module"}));
}
