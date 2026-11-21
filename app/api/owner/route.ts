import { requireMvp, readBody, mvpFailure, mvpJson } from "@/lib/mvp-http";
import { ownerShop, ownerCommand, shopRevision } from "@/lib/owner-store";
export const runtime = "nodejs";
export async function GET() {
  try {
    requireMvp();
    const shop = await ownerShop();
    return mvpJson({ shop, revision: shop ? shopRevision(shop) : null });
  } catch {
    return mvpFailure();
  }
}
export async function POST(request: Request) {
  try {
    requireMvp(request, true);
    const shop = await ownerCommand(await readBody(request));
    return mvpJson({ shop, revision: shop ? shopRevision(shop) : null });
  } catch {
    return mvpFailure();
  }
}
