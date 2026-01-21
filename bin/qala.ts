#!/usr/bin/env node

import { program } from 'commander';
import { initCommand } from '../src/cli/commands/init.js';
import { listCommand } from '../src/cli/commands/list.js';
import { statusCommand } from '../src/cli/commands/status.js';
import { startCommand } from '../src/cli/commands/start.js';
import { stopCommand } from '../src/cli/commands/stop.js';
import { dashboardCommand } from '../src/cli/commands/dashboard.js';
import { decomposeCommand } from '../src/cli/commands/decompose.js';
import { activateCommand } from '../src/cli/commands/activate.js';
import { unregisterCommand } from '../src/cli/commands/unregister.js';
import { tasksCommand } from '../src/cli/commands/tasks.js';
import { specCommand } from '../src/cli/commands/spec.js';
import { updateCommand } from '../src/cli/commands/update.js';
import { tuiCommand } from '../src/cli/commands/tui.js';
import { modelsCommand } from '../src/cli/commands/models.js';

program
  .name('qala')
  .description('Multi-tenant AI-driven task runner powered by Claude')
  .version('0.1.0');

program.addCommand(initCommand);
program.addCommand(listCommand);
program.addCommand(statusCommand);
program.addCommand(startCommand);
program.addCommand(stopCommand);
program.addCommand(dashboardCommand);
program.addCommand(decomposeCommand);
program.addCommand(activateCommand);
program.addCommand(unregisterCommand);
program.addCommand(tasksCommand);
program.addCommand(specCommand);
program.addCommand(updateCommand);
program.addCommand(tuiCommand);
program.addCommand(modelsCommand);

// If no arguments provided, launch TUI by default
if (process.argv.length <= 2) {
  // Lazy import to avoid ESM cycle
  const { runTui } = await import('../src/tui/index.js');
  await runTui();
} else {
  program.parse();
}
