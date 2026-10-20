import path from 'node:path';
import { Liquid } from 'liquidjs';

// Prompts live as LiquidJS templates in prompts/, apart from the code. Values go in as
// template variables, never as template text, and LiquidJS doesn't escape HTML by default
// (outputEscape stays off), so questions and SQL reach the LLM literally.

const liquid = new Liquid({ root: path.join(import.meta.dirname, 'prompts'), extname: '.liquid' });

/** Renders `prompts/<name>.liquid` with the given variables. */
export function renderPrompt(name: string, variables: Record<string, unknown>): string {
  return liquid.renderFileSync(name, variables).trim();
}
