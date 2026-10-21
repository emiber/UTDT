import type { DatabaseSync } from 'node:sqlite';
import { readCatalog } from './catalog.ts';

/**
 * The text that describes the data to the LLM, built only from the metadata: tables, columns
 * and relationships, in load order. Indexes stay out. Undeclared tables are already dropped
 * by the catalog, which throws if the metadata tables are missing.
 */
export function buildSchemaContext(db: DatabaseSync): string {
  const { tables, relationships } = readCatalog(db);
  const sections = tables.map((table) => {
    const columns = table.columns.map((c) => `  - ${c.name} (${c.dataType}): ${c.description}`);
    return [`Table ${table.name}: ${table.description}`, ...columns].join('\n');
  });
  if (relationships.length) {
    const lines = relationships.map(
      (r) => `  - ${r.fromTable}.${r.fromColumn} → ${r.toTable}.${r.toColumn}: ${r.description}`,
    );
    sections.push(['Relationships:', ...lines].join('\n'));
  }
  return sections.join('\n\n');
}
