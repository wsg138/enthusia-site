import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

export function d1(database, { beforeBatch = null } = {}) {
  function prepared(sql) {
    let params = [];
    return {
      bind(...values) {
        params = values;
        return this;
      },
      async all() {
        return { results: database.prepare(sql).all(...params) };
      },
      async first() {
        return database.prepare(sql).get(...params) ?? null;
      },
      async run() {
        const result = database.prepare(sql).run(...params);
        return { meta: { changes: Number(result.changes ?? 0) } };
      },
      _params() {
        return params;
      },
      _sql: sql
    };
  }

  return {
    prepare: prepared,
    async batch(statements) {
      if (beforeBatch) beforeBatch(database);
      database.exec("BEGIN");
      try {
        const results = statements.map((statement) => {
          const result = database.prepare(statement._sql).run(...statement._params());
          return { meta: { changes: Number(result.changes ?? 0) } };
        });
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    }
  };
}

export async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  const directory = new URL("../../migrations/", import.meta.url);
  const files = (await readdir(directory)).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort();
  for (const file of files) database.exec(await readFile(new URL(`../../migrations/${file}`, import.meta.url), "utf8"));
  return database;
}
