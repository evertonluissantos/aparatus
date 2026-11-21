// pg bridge for the same parameterized tagged-SQL protocol accepted by Prisma.
// This validates PostgreSQL SQL/locks, not PrismaPg runtime compatibility.
export function databaseFromPool(pool) {
  function connection(client) {
    const query = async (parts, ...values) => {
      const text = parts.reduce(
        (sql, part, index) =>
          sql + part + (index < values.length ? `$${index + 1}` : ""),
        "",
      );
      return client.query(text, values);
    };
    return {
      $queryRaw: async (...args) => (await query(...args)).rows,
      $executeRaw: async (...args) => (await query(...args)).rowCount,
      booking: {
        findMany: async ({ where, take }) =>
          (
            await client.query(
              'SELECT * FROM "Booking" WHERE "stripeChargeId" = $1 LIMIT $2',
              [where.stripeChargeId, take],
            )
          ).rows,
      },
    };
  }
  return {
    ...connection(pool),
    async $transaction(work) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '10s'");
        const result = await work(connection(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
