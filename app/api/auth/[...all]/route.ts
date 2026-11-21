import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { OWNER_AUTH_ENABLED } from "@/lib/owner-auth-policy";

const handlers = toNextJsHandler(auth.handler);
export async function GET(request: Request) {
  if (!OWNER_AUTH_ENABLED)
    return Response.json(
      { error: "Autenticação ainda não ativada." },
      { status: 503 },
    );
  return handlers.GET(request);
}
export async function POST(request: Request) {
  if (!OWNER_AUTH_ENABLED)
    return Response.json(
      { error: "Autenticação ainda não ativada." },
      { status: 503 },
    );
  return handlers.POST(request);
}
