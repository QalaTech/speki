#!/usr/bin/env node

import { program } from 'commander';
import { initCommand } from './commands/init.js';
import { listCommand } from './commands/list.js';
import { statusCommand } from './commands/status.js';
import { startCommand } from './commands/start.js';
import { stopCommand } from './commands/stop.js';
import { dashboardCommand } from './commands/dashboard.js';
import { decomposeCommand } from './commands/decompose.js';
import { activateCommand } from './commands/activate.js';
import { unregisterCommand } from './commands/unregister.js';
import { tasksCommand } from './commands/tasks.js';
import { specCommand } from './commands/spec.js';
import { updateCommand } from './commands/update.js';
import { tuiCommand } from './commands/tui.js';
import { modelsCommand } from './commands/models.js';
import { idsCommand } from './commands/ids.js';

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
program.addCommand(idsCommand);

// If no arguments provided, launch TUI by default
if (process.argv.length <= 2) {
  // Lazy import to avoid ESM cycle
  const { runTui } = await import('./tui/index.js');
  await runTui();
} else {
  program.parse();
}
