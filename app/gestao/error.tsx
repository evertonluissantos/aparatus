"use client";
import { Button } from "../_components/ui/button";
export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return (
    <section
      role="alert"
      className="bg-background space-y-4 rounded-xl border p-8"
    >
      <h2 className="text-xl font-semibold">
        Não foi possível carregar esta seção
      </h2>
      <p className="text-muted-foreground text-sm">
        Verifique sua sessão e tente novamente. Confira o histórico antes de
        repetir uma ação de confirmação.
      </p>
      <Button variant="outline" onClick={reset}>
        Tentar novamente
      </Button>
    </section>
  );
}
