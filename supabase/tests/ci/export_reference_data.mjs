import { execFileSync } from "node:child_process";
const specs = [
  ["exercises", "created_by IS NULL"],
  ["test_definitions", "created_by IS NULL"],
  ["test_variables", "test_definition_id IN (SELECT id FROM public.test_definitions WHERE created_by IS NULL)"],
  ["energy_sessions", "created_by IS NULL AND athlete_id IS NULL"],
  ["hyrox_test_grid_versions", "true"], ["hyrox_test_grids", "true"], ["hyrox_reference_segments", "true"],
  ["hyrox_work_axes_rules", "true"], ["hyrox_axes_params", "true"], ["hyrox_test_params", "true"], ["data_source_policies", "true"],
];
const out = [
  `-- Données de référence (bibliothèques : aucune donnée d'athlète ni de coach), exportées de la prod le ${new Date().toISOString().slice(0, 10)}.`,
  "-- created_by remis à NULL. Régénérer : voir supabase/tests/ci/README.md.",
  "SET session_replication_role = replica;", "",
];
for (const [t, w] of specs) {
  const sql = `select json_agg(x) as j from (select * from public.${t} where ${w}) x`;
  const raw = execFileSync("supabase", ["db", "query", "--linked", "-o", "json", sql], { maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] }).toString();
  const parsed = JSON.parse(raw.slice(raw.indexOf("{"))).rows;
  let rows = parsed[0].j ?? [];
  if (typeof rows === "string") rows = JSON.parse(rows);
  rows = rows.map(r => ("created_by" in r ? { ...r, created_by: null } : r));
  const lit = JSON.stringify(rows).replace(/'/g, "''");
  out.push(`-- ${t} : ${rows.length} lignes`);
  out.push(`INSERT INTO public.${t} SELECT * FROM json_populate_recordset(NULL::public.${t}, '${lit}');`, "");
  console.error(t, rows.length);
}
out.push("SET session_replication_role = origin;");
process.stdout.write(out.join("\n") + "\n");
