import { Command } from 'commander';
import { detectAllModels, detectModels } from '../../core/cli-detect.js';

export const modelsCommand = new Command('models')
  .description('Detect available LLM models from installed CLIs')
  .option('--engine <engine>', 'Filter to a single engine (claude|codex)')
  .option('--json', 'Output JSON')
  .action(async (opts: { engine?: string; json?: boolean }) => {
    try {
      if (opts.engine) {
        const engine = opts.engine as 'claude' | 'codex';
        if (engine !== 'claude' && engine !== 'codex') {
          console.error('Invalid engine. Use "claude" or "codex".');
          process.exit(1);
        }
        const res = await detectModels(engine);
        if (opts.json) {
          console.log(JSON.stringify({ [engine]: res }, null, 2));
        } else {
          console.log(`Engine: ${engine}`);
          console.log(`Available: ${res.available}`);
          if (res.error) console.log(`Error: ${res.error}`);
          console.log('Models:');
          for (const m of res.models) console.log(`  - ${m}`);
        }
        return;
      }

      const all = await detectAllModels();
      if (opts.json) {
        console.log(JSON.stringify(all, null, 2));
      } else {
        console.log('Claude:');
        console.log(`  Available: ${all.claude.available}`);
        if (all.claude.error) console.log(`  Error: ${all.claude.error}`);
        console.log('  Models:');
        for (const m of all.claude.models) console.log(`    - ${m}`);

        console.log('\nCodex:');
        console.log(`  Available: ${all.codex.available}`);
        if (all.codex.error) console.log(`  Error: ${all.codex.error}`);
        console.log('  Models:');
        for (const m of all.codex.models) console.log(`    - ${m}`);
      }
    } catch (err) {
      console.error('Failed to detect models:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

