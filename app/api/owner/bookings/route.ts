import { requireMvp, readBody, mvpFailure, mvpJson } from "@/lib/mvp-http";
import { book, changeStatus } from "@/lib/mvp-bookings";
import { shopRevision } from "@/lib/owner-store";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireMvp(request, true);
    const shop = await book(request, await readBody(request), true);
    if (!shop || !("services" in shop)) throw new Error();
    return mvpJson({ shop, revision: shopRevision(shop) });
  } catch {
    return mvpFailure();
  }
}
export async function PATCH(request: Request) {
  try {
    requireMvp(request, true);
    const shop = await changeStatus(await readBody(request));
    return mvpJson({ shop, revision: shop ? shopRevision(shop) : null });
  } catch {
    return mvpFailure();
  }
}
