import { parseCliArguments, parseSeedEnv } from "./seed/cli-options";
import { buildDataset } from "./seed/dataset";
import { createSupabaseGateway } from "./seed/gateway";
import { SeedError, writeSeed, type TableCounts } from "./seed/write";

function formatSummary(counts: TableCounts): string {
  const width = Math.max(...Object.keys(counts).map((table) => table.length));
  const lines = Object.entries(counts).map(
    ([table, count]) => `  ${table.padEnd(width)}  ${count}`,
  );
  return ["Seed completed. Rows written:", ...lines].join("\n");
}

async function main(): Promise<void> {
  const options = parseCliArguments(process.argv.slice(2));
  const env = parseSeedEnv(process.env);
  const dataset = buildDataset({
    mode: options.mode,
    seed: options.seed,
    now: options.now ?? new Date(),
  });
  const counts = await writeSeed(createSupabaseGateway(env), env, dataset);
  process.stdout.write(`${formatSummary(counts)}\n`);
}

main().catch((error: unknown) => {
  const message =
    error instanceof SeedError || error instanceof Error ? error.message : String(error);
  process.stderr.write(`Seed failed: ${message}\n`);
  process.exitCode = 1;
});
