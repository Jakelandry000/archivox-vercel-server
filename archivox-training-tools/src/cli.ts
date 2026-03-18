#!/usr/bin/env node

const HELP = `
archivox-training-tools CLI

Usage:
  node dist/cli.js <command> [options]

Commands:
  ingest    Ingest source files into a named corpus

Options:
  --input   <path>    Path to source file or directory (required for ingest)
  --corpus  <name>    Target corpus name (required for ingest)
  --help              Show this help message
`.trim();

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      // separator injected by package managers — skip
      continue;
    } else if (arg === "--help") {
      args["help"] = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else if (!arg.startsWith("-")) {
      args["command"] = arg;
    }
  }
  return args;
}

function cmdIngest(args: Record<string, string | boolean>): void {
  const input = args["input"];
  const corpus = args["corpus"];

  if (!input || !corpus) {
    console.error("Error: --input and --corpus are required for ingest.");
    console.error("  Example: node dist/cli.js ingest --input ./data --corpus my-corpus");
    process.exit(1);
  }

  console.log("[ingest] Parsed args:");
  console.log("  input: ", input);
  console.log("  corpus:", corpus);
  console.log("[ingest] (stub) Ingestion pipeline not yet implemented.");
}

function main(): void {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (args["help"] || argv.length === 0) {
    console.log(HELP);
    process.exit(0);
  }

  const command = args["command"] as string | undefined;

  switch (command) {
    case "ingest":
      cmdIngest(args);
      break;
    default:
      console.error(`Unknown command: "${command ?? ""}"`);
      console.log(HELP);
      process.exit(1);
  }
}

main();
