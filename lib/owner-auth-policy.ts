import { z } from "zod";

// Deliberately not an environment/browser flag. Activation requires a reviewed
// rollout after database, ownership uniqueness and authorization validation.
export const OWNER_AUTH_ENABLED: boolean =
  process.env.CORTZ_PERSISTENCE_ENABLED === "true";
export const OWNER_AUTH_CALLBACK = "/painel";
export function disabledManagementAccess(environment: string | undefined) {
  return environment === "development" || environment === "test"
    ? "demo"
    : "unavailable";
}
export const ownerEmailPasswordOptions = {
  enabled: OWNER_AUTH_ENABLED,
  minPasswordLength: 12,
  maxPasswordLength: 128,
};

export const ownerLoginSchema = z.object({
  email: z
    .string()
    .trim()
    .max(254, "E-mail inválido.")
    .pipe(z.email("Informe um e-mail válido.")),
  password: z.string().min(1, "Informe sua senha.").max(128, "Senha inválida."),
});
export const ownerRegistrationSchema = ownerLoginSchema
  .extend({
    name: z
      .string()
      .trim()
      .min(2, "Informe seu nome.")
      .max(80, "Use até 80 caracteres."),
    password: z
      .string()
      .min(12, "Use pelo menos 12 caracteres.")
      .max(128, "Use no máximo 128 caracteres."),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não coincidem.",
  });

// Never display provider exceptions, URLs, submitted fields or server messages.
export function ownerAuthErrorMessage(
  operation: "login" | "register" | "google" | "logout",
) {
  if (operation === "login")
    return "Não foi possível entrar. Confira seus dados e tente novamente.";
  if (operation === "register")
    return "Não foi possível criar a conta. Tente novamente ou utilize o acesso existente.";
  if (operation === "google")
    return "Não foi possível iniciar o acesso com Google. Tente novamente.";
  return "Não foi possível encerrar a sessão. Tente novamente.";
}
