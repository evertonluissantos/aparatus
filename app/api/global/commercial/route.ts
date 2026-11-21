import { requireMvp, readBody, mvpFailure, mvpJson } from "@/lib/mvp-http";
import { commercialCommand } from "@/lib/global-commercial";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireMvp(request, true);
    return mvpJson(await commercialCommand(await readBody(request)));
  } catch {
    return mvpFailure();
  }
}
