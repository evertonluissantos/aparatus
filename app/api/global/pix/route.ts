import { requireMvp, readBody, mvpFailure, mvpJson } from "@/lib/mvp-http";
import { confirmPix, listSubscriptions } from "@/lib/manual-pix";
export const runtime = "nodejs";
export async function GET() {
  try {
    requireMvp();
    return mvpJson(await listSubscriptions());
  } catch {
    return mvpFailure();
  }
}
export async function POST(request: Request) {
  try {
    requireMvp(request, true);
    return mvpJson(await confirmPix(await readBody(request)));
  } catch {
    return mvpFailure();
  }
}
