export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Carregando gestão"
      className="animate-pulse space-y-6"
    >
      <p className="text-muted-foreground text-sm">Carregando informações...</p>
      <div className="bg-muted h-9 w-56 rounded-lg" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-muted h-32 rounded-xl" />
        ))}
      </div>
      <div className="bg-muted h-72 rounded-xl" />
    </div>
  );
}
