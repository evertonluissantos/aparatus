import { requireMvp, readBody, mvpFailure, mvpJson } from "@/lib/mvp-http";
import {
  publicCatalog,
  ensureGuestCookie,
  available,
  book,
} from "@/lib/mvp-bookings";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    requireMvp();
    const url = new URL(request.url);
    const data = url.searchParams.has("localDate")
      ? await available(Object.fromEntries(url.searchParams))
      : await publicCatalog(url.searchParams.get("slug") ?? undefined);
    return ensureGuestCookie(request, mvpJson(data));
  } catch {
    return mvpFailure();
  }
}
export async function POST(request: Request) {
  try {
    requireMvp(request, true);
    return mvpJson(await book(request, await readBody(request)));
  } catch {
    return mvpFailure();
  }
}
