// Compare deux bases en lecture seule avant une bascule : lignes et empreinte du contenu de chaque table
// de `public`, séquences, somme des Zeni. Code de sortie 1 au moindre écart. Usage :
//   SOURCE_URL="postgresql://…ancienne…" TARGET_URL="postgresql://…nouvelle…" npx tsx scripts/compare-databases.mts
// Les URL restent dans l'environnement : rien n'est affiché, rien n'est écrit.
import pg from "pg";
import { pgConfig } from "../server/pg-adapter.ts";

const source = process.env.SOURCE_URL;
const target = process.env.TARGET_URL;
if (!source || !target) {
  console.error("SOURCE_URL et TARGET_URL requises.");
  process.exit(1);
}

/** Photographie cohérente (une transaction REPEATABLE READ en lecture seule) : clé → valeur. */
async function snapshot(connectionString: string): Promise<Map<string, string>> {
  const client = new pg.Client({ ...pgConfig(connectionString), connectionTimeoutMillis: 15_000 });
  await client.connect();
  const out = new Map<string, string>();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    // Même rendu des dates des deux côtés, pour que l'empreinte ne dépende que des données.
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    const tables = await client.query<{ name: string }>("SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY 1");
    for (const { name } of tables.rows) {
      const { rows } = await client.query<{ n: string; digest: string | null }>(
        `SELECT count(*)::text AS n, md5(string_agg(md5(t::text), '' ORDER BY md5(t::text))) AS digest FROM public.${client.escapeIdentifier(name)} t`,
      );
      out.set(`table ${name}`, `${rows[0].n} lignes · ${rows[0].digest ?? "vide"}`);
    }
    const sequences = await client.query<{ name: string; value: string | null }>(
      "SELECT sequencename AS name, last_value::text AS value FROM pg_sequences WHERE schemaname = 'public' ORDER BY 1",
    );
    for (const { name, value } of sequences.rows) out.set(`séquence ${name}`, value ?? "jamais utilisée");
    const zeni = await client.query<{ total: string }>(`SELECT coalesce(sum(coins), 0)::text AS total FROM public."User"`);
    out.set("Σ Zeni des joueurs", zeni.rows[0].total);
    await client.query("COMMIT");
  } finally {
    await client.end();
  }
  return out;
}

const [before, after] = await Promise.all([snapshot(source), snapshot(target)]);
let gaps = 0;
for (const key of [...new Set([...before.keys(), ...after.keys()])].sort()) {
  const [a, b] = [before.get(key) ?? "absente", after.get(key) ?? "absente"];
  const same = a === b;
  if (!same) gaps++;
  console.log(`${same ? "✓" : "✖"} ${key} : ${same ? a : `${a} → ${b}`}`);
}
console.log(gaps === 0 ? "\nAucun écart : les deux bases contiennent les mêmes données." : `\n${gaps} écart(s) : ne pas basculer.`);
process.exit(gaps === 0 ? 0 : 1);
