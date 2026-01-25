import chalk from "chalk";
import { execSync } from "child_process";
import { Command } from "commander";
import { basename, join } from "path";
import { confirm } from "@inquirer/prompts";
import { Project } from "@speki/core";
import { Registry } from "@speki/core";
import { isCliAvailable, isExecutableAvailable } from "@speki/core";


/**
 * Install Serena MCP server for Claude Code integration
 */

/**
 * Prompt user for Serena MCP installation (only if Claude CLI is available)
 */
async function promptForSerenaInstall(): Promise<boolean> {
  // Only relevant if Claude CLI is available
  if (!isCliAvailable('claude')) {
    return false; // Skip silently - Claude not installed
  }

  return confirm({
    message: 'Install Serena MCP server for Claude Code integration?',
    default: true,
  });
}

async function installSerena(projectPath: string): Promise<void> {
  // Check if Claude CLI exists
  if (!isCliAvailable('claude')) {
    console.log(chalk.yellow("  Skipping Serena: Claude CLI not found"));
    return;
  }

  // Check if uv is installed
  if (!isExecutableAvailable('uv')) {
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
  .option("-f, --force", "Overwrite existing .speki directory")
  .option("--no-serena", "Skip Serena MCP server installation")
  .action(async (options) => {
    const projectPath = process.cwd();
    const project = new Project(projectPath);

    // Check if already initialized
    if (await project.exists()) {
      if (!options.force) {
        console.error(
          chalk.red(
            "Error: .speki directory already exists. Use --force to overwrite."
          )
        );
        process.exit(1);
      }
      console.log(
        chalk.yellow("Warning: Overwriting existing .speki directory...")
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
      // Initialize .speki directory
      await project.initialize({
        name: projectName,
        branchName: options.branch,
        language: options.language,
      });

      // Register in central registry
      await Registry.register(projectPath, projectName);

      // Install Serena MCP server
      // If --no-serena flag is provided, skip without prompting
      // Otherwise, prompt user for confirmation
      if (options.serena) {
        // --no-serena was NOT provided, so prompt the user
        const shouldInstallSerena = await promptForSerenaInstall();
        if (shouldInstallSerena) {
          await installSerena(projectPath);
        } else {
          console.log(chalk.yellow("  Skipping Serena installation"));
        }
      } else {
        // --no-serena was provided, skip silently
        console.log(chalk.yellow("  Serena installation skipped (--no-serena flag provided)"));
      }

      console.log("");
      console.log(chalk.green("Successfully initialized Qala project!"));
      console.log("");
      console.log("Created:");
      console.log(
        `  ${chalk.cyan(".speki/")} - Project configuration directory`
      );
      console.log(`  ${chalk.cyan(".speki/config.json")} - Project settings`);
      console.log(
        `  ${chalk.cyan(".speki/prompt.md")} - Claude prompt template`
      );
      console.log(`  ${chalk.cyan(".speki/standards/")} - Language standards`);
      console.log(`  ${chalk.cyan(".speki/tasks/")} - Generated tasks`);
      console.log(`  ${chalk.cyan(".speki/logs/")} - Execution logs`);
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
