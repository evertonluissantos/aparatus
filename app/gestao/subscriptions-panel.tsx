import { subscriptionCoverage } from "@/lib/global-reports";
import { Heading, Status, Empty, DataTable, cell, monthLabel } from "./ui";
export async function SubscriptionsPanel() {
  const shops = await subscriptionCoverage();
  return (
    <div className="space-y-6">
      <Heading
        title="Assinaturas"
        description="Cobertura por competência confirmada manualmente. Não há cobrança recorrente, renovação ou suspensão automática."
      />
      <div className="bg-background grid gap-4 rounded-xl border p-5 sm:grid-cols-2">
        <p className="text-sm">
          Com competência atual confirmada{" "}
          <strong className="mt-2 block text-2xl">
            {shops.filter((s) => s.covered).length}
          </strong>
        </p>
        <p className="text-muted-foreground text-sm">
          Sem confirmação na competência atual{" "}
          <strong className="text-foreground mt-2 block text-2xl">
            {shops.filter((s) => !s.covered).length}
          </strong>
        </p>
      </div>
      {!shops.length ? (
        <Empty>Nenhuma barbearia cadastrada para acompanhar.</Empty>
      ) : (
        <DataTable
          headers={[
            "Barbearia",
            "Competência atual",
            "Última confirmada",
            "Cobertura do mês",
          ]}
        >
          {shops.map((s) => (
            <tr key={s.id} className="hover:bg-muted/20">
              <td className={`${cell} font-medium`}>{s.name}</td>
              <td className={cell}>{monthLabel(s.competence)}</td>
              <td className={cell}>
                {s.lastCompetence ? monthLabel(s.lastCompetence) : "Nenhuma"}
              </td>
              <td className={cell}>
                <Status strong={s.covered}>
                  {s.covered ? "Confirmada" : "Sem confirmação"}
                </Status>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
