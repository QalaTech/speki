import chalk from "chalk";
import { execFileSync, execSync } from "child_process";
import { Command } from "commander";
import { basename, join } from "path";
import { existsSync } from "fs";
import { Project } from "../../core/project.js";
import { Registry } from "../../core/registry.js";

/**
 * Cross-platform command existence check
 */
function commandExists(command: string): boolean {
  const isWin = process.platform === 'win32';
  const locator = isWin ? 'where' : 'which';
  try {
    const out = execFileSync(locator, [command], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).trim();
    return !!out;
  } catch {
    // Fallback: scan PATH for Windows where .cmd/.exe may be needed
    const pathVar = process.env.PATH || '';
    const sep = isWin ? ';' : ':';
    const dirs = pathVar.split(sep).filter(Boolean);
    const exts = isWin ? ['.exe', '.cmd', '.ps1', ''] : [''];
    for (const dir of dirs) {
      for (const ext of exts) {
        const candidate = join(dir, command + ext);
        if (existsSync(candidate)) {
          return true;
        }
      }
    }
    return false;
  }
}

/**
 * Install Serena MCP server for Claude Code integration
 */
async function installSerena(projectPath: string): Promise<void> {
  // Check if Claude CLI exists
  if (!commandExists("claude")) {
    console.log(chalk.yellow("  Skipping Serena: Claude CLI not found"));
    return;
  }

  // Check if uv is installed
  if (!commandExists("uv")) {
    console.log("");
    console.log(
      chalk.red("Error: uv is required to install Serena but was not found.")
    );
    console.log("");
    console.log("Please install uv first:");
    console.log(
      chalk.cyan("  https://docs.astral.sh/uv/getting-started/installation/")
    );
    console.log("");
    console.log("Quick install options:");
    console.log(chalk.gray("  # macOS/Linux:"));
    console.log(
      chalk.cyan("  curl -LsSf https://astral.sh/uv/install.sh | sh")
    );
    console.log("");
    console.log(chalk.gray("  # Windows:"));
    console.log(
      chalk.cyan(
        '  powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'
      )
    );
    console.log("");
    console.log(
      chalk.yellow(
        "After installing uv, run qala init again or manually add Serena:"
      )
    );
    console.log(
      chalk.gray(
        '  claude mcp add serena -- uvx --from git+https://github.com/oraios/serena serena start-mcp-server --context claude-code --project "$(pwd)" --enable-web-dashboard False'
      )
    );
    return;
  }

  // Install Serena (only relevant for Claude CLI integrations)
  console.log(chalk.blue("  Adding Serena MCP server (Claude) ..."));
  try {
    execSync(
      `claude mcp add serena -- uvx --from git+https://github.com/oraios/serena serena start-mcp-server --context claude-code --project "${projectPath}" --enable-web-dashboard False`,
      { stdio: "inherit" }
    );
    console.log(chalk.green("  Serena MCP server added successfully!"));
  } catch {
    // Don't fail the init if Serena installation fails (it might already exist)
    console.log(
      chalk.yellow("  Serena installation skipped (may already be configured)")
    );
  }
}

export const initCommand = new Command("init")
  .description("Initialize a new Qala project in the current directory")
  .option("-n, --name <name>", "Project name (defaults to directory name)")
  .option("-b, --branch <branch>", "Default branch name", "main")
  .option(
    "-l, --language <language>",
    "Primary language (nodejs, python, dotnet, go)",
    "nodejs"
  )
  .option("-f, --force", "Overwrite existing .ralph directory")
  .action(async (options) => {
    const projectPath = process.cwd();
    const project = new Project(projectPath);

    // Check if already initialized
    if (await project.exists()) {
      if (!options.force) {
        console.error(
          chalk.red(
            "Error: .ralph directory already exists. Use --force to overwrite."
          )
        );
        process.exit(1);
      }
      console.log(
        chalk.yellow("Warning: Overwriting existing .ralph directory...")
      );
    }

    // Determine project name
    const projectName = options.name || basename(projectPath);

    console.log(chalk.blue("Initializing Qala project..."));
    console.log(`  ${chalk.gray("Path:")} ${projectPath}`);
    console.log(`  ${chalk.gray("Name:")} ${projectName}`);
    console.log(`  ${chalk.gray("Branch:")} ${options.branch}`);
    console.log(`  ${chalk.gray("Language:")} ${options.language}`);

    try {
      // Initialize .ralph directory
      await project.initialize({
        name: projectName,
        branchName: options.branch,
        language: options.language,
      });

      // Register in central registry
      await Registry.register(projectPath, projectName);

      // Install Serena MCP server
      await installSerena(projectPath);

      console.log("");
      console.log(chalk.green("Successfully initialized Qala project!"));
      console.log("");
      console.log("Created:");
      console.log(
        `  ${chalk.cyan(".ralph/")} - Project configuration directory`
      );
      console.log(`  ${chalk.cyan(".ralph/config.json")} - Project settings`);
      console.log(
        `  ${chalk.cyan(".ralph/prompt.md")} - Claude prompt template`
      );
      console.log(`  ${chalk.cyan(".ralph/standards/")} - Language standards`);
      console.log(`  ${chalk.cyan(".ralph/tasks/")} - Generated tasks`);
      console.log(`  ${chalk.cyan(".ralph/logs/")} - Execution logs`);
      console.log("");
      console.log("Next steps:");
      console.log(`  1. Create a PRD file describing your tasks`);
      console.log(
        `  2. Run ${chalk.cyan("qala decompose <prd-file>")} to generate tasks`
      );
      console.log(`  3. Run ${chalk.cyan("qala start")} to begin execution`);
      console.log("");
      console.log(`Run ${chalk.cyan("qala status")} to see project status.`);
    } catch (error) {
      console.error(chalk.red("Error initializing project:"), error);
      process.exit(1);
    }
  });
