"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import { authClient } from "@/lib/auth-client";
import {
  OWNER_AUTH_CALLBACK,
  ownerLoginSchema,
  ownerRegistrationSchema,
  ownerAuthErrorMessage,
} from "@/lib/owner-auth-policy";

export function OwnerAuthForm({
  googleFailed,
  enabled: OWNER_AUTH_ENABLED,
  googleEnabled,
}: {
  googleFailed: boolean;
  enabled: boolean;
  googleEnabled: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState(
    googleFailed ? ownerAuthErrorMessage("google") : "",
  );
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function run(
    operation: "login" | "register" | "google" | "logout",
    input?: { name?: string; email: string; password: string },
  ) {
    if (!OWNER_AUTH_ENABLED || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result =
        operation === "google"
          ? await authClient.signIn.social({
              provider: "google",
              callbackURL: OWNER_AUTH_CALLBACK,
              errorCallbackURL: "/acesso/proprietario?erro=google",
            })
          : operation === "logout"
            ? await authClient.signOut()
            : operation === "register"
              ? await authClient.signUp.email({
                  name: input!.name!,
                  email: input!.email,
                  password: input!.password,
                  callbackURL: OWNER_AUTH_CALLBACK,
                })
              : await authClient.signIn.email({
                  email: input!.email,
                  password: input!.password,
                  callbackURL: OWNER_AUTH_CALLBACK,
                });
      if (result.error) {
        setError(ownerAuthErrorMessage(operation));
        return;
      }
      if (operation !== "google") {
        router.replace(
          operation === "logout" ? "/acesso/proprietario" : OWNER_AUTH_CALLBACK,
        );
        router.refresh();
      }
    } catch {
      setError(ownerAuthErrorMessage(operation));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!OWNER_AUTH_ENABLED || lock.current) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const parsed = (
      mode === "register" ? ownerRegistrationSchema : ownerLoginSchema
    ).safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    // Passwords remain only in the form/request, never persisted in demo state.
    form.reset();
    void run(mode, parsed.data);
  }
  return (
    <main className="bg-muted/30 min-h-screen px-5 py-10">
      <section className="border-border bg-card mx-auto max-w-md space-y-6 rounded-2xl border p-6 sm:p-8">
        <div>
          <p className="text-muted-foreground text-sm">Cortz · Proprietário</p>
          <h1 className="mt-2 text-2xl font-semibold">
            {mode === "login" ? "Entrar no painel" : "Criar conta"}
          </h1>
        </div>
        {!OWNER_AUTH_ENABLED && (
          <p
            role="status"
            className="text-muted-foreground rounded-xl border p-4 text-sm"
          >
            Autenticação do proprietário ainda não ativada. Cadastro, login,
            Google e encerramento de sessão estão bloqueados nesta tela até a
            validação do banco e das permissões. Não informe credenciais. O
            painel local continua sendo uma demonstração pública.
          </p>
        )}
        <div className="flex gap-3">
          <Button
            type="button"
            variant={mode === "login" ? "default" : "outline"}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            Entrar
          </Button>
          <Button
            type="button"
            variant={mode === "register" ? "default" : "outline"}
            onClick={() => {
              setMode("register");
              setError("");
            }}
          >
            Criar conta
          </Button>
        </div>
        <form noValidate onSubmit={submit} className="space-y-4">
          <fieldset
            disabled={!OWNER_AUTH_ENABLED || busy}
            className="space-y-4 disabled:opacity-60"
          >
            {mode === "register" && (
              <div className="space-y-2">
                <label htmlFor="owner-name" className="text-sm font-medium">
                  Nome
                </label>
                <Input
                  id="owner-name"
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={80}
                />
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="owner-email" className="text-sm font-medium">
                E-mail
              </label>
              <Input
                id="owner-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="owner-password" className="text-sm font-medium">
                Senha
              </label>
              <Input
                id="owner-password"
                name="password"
                type="password"
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                required
                maxLength={128}
              />
            </div>
            {mode === "register" && (
              <>
                <p className="text-muted-foreground text-xs">
                  Use de 12 a 128 caracteres.
                </p>
                <div className="space-y-2">
                  <label
                    htmlFor="owner-confirm"
                    className="text-sm font-medium"
                  >
                    Confirmar senha
                  </label>
                  <Input
                    id="owner-confirm"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    maxLength={128}
                  />
                </div>
              </>
            )}
            <Button type="submit" className="w-full">
              {busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
            </Button>
          </fieldset>
        </form>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <Button
          className="w-full"
          variant="outline"
          disabled={!OWNER_AUTH_ENABLED || !googleEnabled || busy}
          onClick={() => void run("google")}
        >
          Entrar com Google
        </Button>
        <p className="text-muted-foreground text-xs">
          Recuperação de acesso será disponibilizada após configurar e validar o
          envio seguro de e-mails. Criar uma conta não concede acesso global nem
          cria barbearia ou assinatura automaticamente.
        </p>
        <Button
          variant="ghost"
          disabled={!OWNER_AUTH_ENABLED || busy}
          onClick={() => void run("logout")}
        >
          Encerrar sessão
        </Button>
        <p className="text-sm">
          <Link className="underline" href="/painel" prefetch={false}>
            Abrir painel demonstrativo local
          </Link>
        </p>
      </section>
    </main>
  );
}
