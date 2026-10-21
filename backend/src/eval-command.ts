import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { openReadOnlyDatabase } from './db.ts';
import {
  evaluateCase,
  formatCase,
  formatSummary,
  parseGolden,
  summarize,
  type CaseResult,
  type GoldenCase,
} from './evaluate.ts';
import {
  createDecisionClient,
  createLlmClient,
  type DecisionClient,
  type LlmClient,
} from './llm.ts';
import { buildSchemaContext } from './schema-context.ts';

export interface EvalCommandOptions {
  env: NodeJS.ProcessEnv;
  goldenPath: string;
  dataDbPath: string;
  /** Where the JSON report goes (gitignored). */
  reportDir: string;
  print: (line: string) => void;
  now?: () => Date;
  /** The real OpenAI clients by default; tests pass fakes. */
  createLlm?: (env: NodeJS.ProcessEnv) => LlmClient;
  createJudge?: (env: NodeJS.ProcessEnv) => DecisionClient;
  /** The pipeline's classifier: a Decisions API client too. */
  createDecisions?: (env: NodeJS.ProcessEnv) => DecisionClient;
}

/**
 * `npm run eval`. Checks everything before the first OpenAI call: the config, the golden
 * file and `data.db`; a problem there prints why and returns 1, with no report. Then judges
 * each question in order, prints one line per question and the summary, writes the report,
 * and returns 0, whatever the scores.
 */
export async function runEvalCommand(options: EvalCommandOptions): Promise<number> {
  const { env, print, now = () => new Date() } = options;
  let llm: LlmClient;
  let judge: DecisionClient;
  let decisions: DecisionClient;
  let cases: GoldenCase[];
  let dataDb: DatabaseSync;
  let schemaContext: string;
  try {
    llm = (options.createLlm ?? createLlmClient)(env);
    judge = (options.createJudge ?? createDecisionClient)(env);
    decisions = (options.createDecisions ?? createDecisionClient)(env);
    cases = parseGolden(readGolden(options.goldenPath));
    dataDb = openReadOnlyDatabase(options.dataDbPath);
  } catch (error) {
    print(`The evaluation could not start: ${(error as Error).message}`);
    return 1;
  }

  try {
    try {
      schemaContext = buildSchemaContext(dataDb);
    } catch (error) {
      print(`The evaluation could not start: ${(error as Error).message}`);
      return 1;
    }

    const startedAt = now();
    const results: CaseResult[] = [];
    for (const golden of cases) {
      const result = await evaluateCase(golden, {
        dataDb,
        llm,
        decisions,
        judge,
        schemaContext,
      });
      results.push(result);
      print(formatCase(result));
    }
    const summary = summarize(results);
    for (const line of formatSummary(summary)) print(line);

    const file = path.join(
      options.reportDir,
      `eval-${startedAt.toISOString().replace(/[:.]/g, '-')}.json`,
    );
    const report = {
      startedAt: startedAt.toISOString(),
      models: { pipeline: llm.model, judge: judge.model },
      summary,
      results,
    };
    try {
      mkdirSync(options.reportDir, { recursive: true });
      writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
    } catch (error) {
      // The lines and the summary are already printed: say why the file is missing.
      print(`The report could not be written: ${(error as Error).message}`);
      return 1;
    }
    print(`Report: ${file}`);
    return 0;
  } finally {
    dataDb.close();
  }
}

function readGolden(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    throw new Error(`The golden file was not found at ${file}.`);
  }
}
