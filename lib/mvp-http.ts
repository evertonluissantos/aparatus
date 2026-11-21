import "server-only";
import { OWNER_AUTH_ENABLED } from "./owner-auth-policy";

export function requireMvp(request?: Request, write = false) {
  if (!OWNER_AUTH_ENABLED) throw new Error("MVP_DISABLED");
  if (write && request) {
    const configured = process.env.BETTER_AUTH_URL;
    if (
      !configured ||
      request.headers.get("origin") !== new URL(configured).origin
    )
      throw new Error("ORIGIN_REJECTED");
  }
}

export async function readBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("INVALID_INPUT");
  if (Number(request.headers.get("content-length")) > 3_000_000)
    throw new Error("INVALID_INPUT");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_INPUT");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 3_000_000) {
        await reader.cancel();
        throw new Error("INVALID_INPUT");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally {
    reader.releaseLock();
  }
}

export function mvpFailure() {
  // Never return Prisma/provider exceptions, submitted fields or private records.
  return Response.json(
    {
      error:
        "Não foi possível concluir. Confira os dados e sua permissão; atualize a página antes de tentar novamente.",
    },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}
export function mvpJson(value: unknown) {
  return Response.json(value, { headers: { "Cache-Control": "no-store" } });
}
