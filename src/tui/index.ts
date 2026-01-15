import chalk from 'chalk';
import { select, input, confirm } from '@inquirer/prompts';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Registry } from '../core/registry.js';
import { Project } from '../core/project.js';
import { loadGlobalSettings, saveGlobalSettings } from '../core/settings.js';

interface Ctx {
  projectPath: string | null;
}

function getCliEntryPath(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // From dist/src/tui -> dist/bin/qala.js
  return join(__dirname, '..', '..', 'bin', 'qala.js');
}

function runCli(args: string[], projectPath?: string): Promise<number> {
  return new Promise((resolve) => {
    const cliPath = getCliEntryPath();
    const child = spawn(process.execPath, [cliPath, ...args], {
      stdio: 'inherit',
      env: projectPath ? { ...process.env, QALA_PROJECT: projectPath } : process.env,
    });
    child.on('close', (code) => resolve(code ?? 0));
    child.on('error', () => resolve(1));
  });
}

async function pickProject(): Promise<string | null> {
  const projects = await Registry.list();
  if (projects.length === 0) {
    console.log(chalk.yellow('No projects registered. Run `qala init` in a project directory.'));
    return null;
  }
  const choice = await select({
    message: 'Select a project',
    choices: projects.map((p) => ({ name: `${p.name} ${chalk.gray(`(${p.path})`)}`, value: p.path })),
  });
  return choice;
}

async function projectDashboard(ctx: Ctx) {
  while (true) {
    const projectPath = ctx.projectPath ?? (await pickProject());
    if (!projectPath) return;
    ctx.projectPath = projectPath;

    const project = new Project(projectPath);
    const [status, decompose, prd] = await Promise.all([
      project.loadStatus(),
      project.loadDecomposeState(),
      project.loadPRD(),
    ]);

    console.log('');
    console.log(chalk.bold(`Project: ${projectPath}`));
    console.log(`  Status: ${status.status}`);
    if (status.currentIteration) console.log(`  Iteration: ${status.currentIteration}/${status.maxIterations ?? '?'}`);
    console.log(`  Decompose: ${decompose.status} - ${decompose.message}`);
    console.log(`  Stories: ${prd?.userStories?.length ?? 0}`);

    const action = await select({
      message: 'Choose an action',
      choices: [
        { name: 'Start Ralph', value: 'start' },
        { name: 'Stop Ralph', value: 'stop' },
        { name: 'Decompose PRD', value: 'decompose' },
        { name: 'Spec Review', value: 'spec' },
        { name: 'Open Dashboard', value: 'dashboard' },
        { name: 'Back', value: 'back' },
      ],
    });

    if (action === 'back') return;
    if (action === 'start') {
      const engine = await input({ message: 'Engine (leave blank to use default):', default: '' });
      const model = await input({ message: 'Model (leave blank to use default):', default: '' });
      await runCli(['start', '--project', projectPath, ...(engine ? ['--engine', engine] : []), ...(model ? ['--model', model] : [])]);
    } else if (action === 'stop') {
      await runCli(['stop', '--project', projectPath]);
    } else if (action === 'decompose') {
      const prdFile = await input({ message: 'Path to PRD markdown file:' });
      if (prdFile) {
        const engine = await input({ message: 'Engine (leave blank to use default):', default: '' });
        const model = await input({ message: 'Model (leave blank to use default):', default: '' });
        await runCli(['decompose', prdFile, '--project', projectPath, ...(engine ? ['--engine', engine] : []), ...(model ? ['--model', model] : [])]);
      }
    } else if (action === 'spec') {
      const specFile = await input({ message: 'Path to spec markdown file:' });
      if (specFile) {
        const engine = await input({ message: 'Engine (leave blank to use default):', default: '' });
        const model = await input({ message: 'Model (leave blank to use default):', default: '' });
        await runCli(['spec', 'review', specFile, '--project', projectPath, ...(engine ? ['--engine', engine] : []), ...(model ? ['--model', model] : [])]);
      }
    } else if (action === 'dashboard') {
      await runCli(['dashboard']);
    }
  }
}

async function settingsScreen() {
  const settings = await loadGlobalSettings();
  console.log('');
  console.log(chalk.bold('Global Settings'));
  console.log(`  Reviewer CLI: ${settings.reviewer.cli}`);
  console.log(`  Keep Awake: ${settings.execution.keepAwake ? 'Yes' : 'No'}`);
  console.log(`  LLM Engine: ${settings.llm?.defaultEngine ?? 'auto'}`);
  console.log(`  LLM Model: ${settings.llm?.defaultModel ?? ''}`);

  const change = await confirm({ message: 'Edit LLM engine/model?', default: false });
  if (!change) return;
  const engine = await input({ message: 'Default engine (auto/claude-cli/codex-cli/custom-cli):', default: settings.llm?.defaultEngine ?? 'auto' });
  const model = await input({ message: 'Default model (optional):', default: settings.llm?.defaultModel ?? '' });
  const newSettings = { ...settings, llm: { ...(settings.llm || {}), defaultEngine: engine || 'auto', defaultModel: model || undefined } };
  await saveGlobalSettings(newSettings);
  console.log(chalk.green('Settings saved.'));
}

async function mainMenu(ctx: Ctx) {
  while (true) {
    const choice = await select({
      message: 'Qala TUI',
      choices: [
        { name: 'Projects', value: 'projects' },
        { name: 'Execution', value: 'exec' },
        { name: 'Settings', value: 'settings' },
        { name: 'Quit', value: 'quit' },
      ],
    });

    if (choice === 'quit') return;
    if (choice === 'projects') {
      const path = await pickProject();
      if (path) ctx.projectPath = path;
    } else if (choice === 'exec') {
      await projectDashboard(ctx);
    } else if (choice === 'settings') {
      await settingsScreen();
    }
  }
}

export async function runTui(): Promise<void> {
  const ctx: Ctx = { projectPath: null };
  await mainMenu(ctx);
}

