import { requireMvp, readBody, mvpFailure, mvpJson } from "@/lib/mvp-http";
import { changeSuspension, listManagedShops } from "@/lib/global-management";
export const runtime = "nodejs";
export async function GET() {
  try {
    requireMvp();
    return mvpJson(await listManagedShops());
  } catch {
    return mvpFailure();
  }
}
export async function PATCH(request: Request) {
  try {
    requireMvp(request, true);
    return mvpJson(await changeSuspension(await readBody(request)));
  } catch {
    return mvpFailure();
  }
}
