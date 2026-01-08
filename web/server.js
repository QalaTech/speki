import cors from "cors";
import express from "express";
import { spawn } from "child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  copyFileSync,
  writeFileSync,
  unlinkSync,
} from "fs";
import { dirname, join, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RALPH_DIR = join(__dirname, "..");
const SPECS_DIR = join(RALPH_DIR, "..", "specs");

const app = express();
app.use(cors());
app.use(express.json());

// API: Get PRD/tasks
app.get("/api/tasks", (req, res) => {
  try {
    const prdPath = join(RALPH_DIR, "prd.json");
    if (!existsSync(prdPath)) {
      return res.json({ error: "No prd.json found", tasks: null });
    }
    const content = readFileSync(prdPath, "utf-8");
    const data = JSON.parse(content);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get progress
app.get("/api/progress", (req, res) => {
  try {
    const progressPath = join(RALPH_DIR, "progress.txt");
    if (!existsSync(progressPath)) {
      return res.json({ content: "No progress.txt found" });
    }
    const content = readFileSync(progressPath, "utf-8");
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to format tool calls nicely
function formatToolCall(name, input) {
  const icons = {
    Read: "📄",
    Write: "✏️",
    Edit: "🔧",
    Glob: "🔍",
    Grep: "🔎",
    Bash: "💻",
    Task: "🤖",
    TodoWrite: "📋",
    WebSearch: "🌐",
    WebFetch: "🌐",
  };
  const icon = icons[name] || "⚡";

  switch (name) {
    case "Read":
      const fileName = input?.file_path?.split("/").pop() || "file";
      return `${icon} Reading ${fileName}`;
    case "Write":
      const writeFile = input?.file_path?.split("/").pop() || "file";
      return `${icon} Writing ${writeFile}`;
    case "Edit":
      const editFile = input?.file_path?.split("/").pop() || "file";
      return `${icon} Editing ${editFile}`;
    case "Glob":
      return `${icon} Searching: ${input?.pattern || "files"}`;
    case "Grep":
      return `${icon} Searching for: "${input?.pattern || "pattern"}"`;
    case "Bash":
      const cmd = input?.command?.substring(0, 60) || "command";
      return `${icon} Running: ${cmd}${input?.command?.length > 60 ? "..." : ""}`;
    case "Task":
      return `${icon} Spawning agent: ${input?.description || input?.subagent_type || "task"}`;
    case "TodoWrite":
      return `${icon} Updating task list`;
    default:
      return `${icon} ${name}`;
  }
}

// Helper to format tool results briefly
function formatToolResult(toolId, content, pendingTools) {
  const tool = pendingTools.get(toolId);
  if (!tool) return null;

  const name = tool.name;
  const contentStr =
    typeof content === "string" ? content : JSON.stringify(content);

  // Check for actual errors (not just the word "error" in content)
  const isActualError =
    contentStr.startsWith("Error:") ||
    contentStr.includes('"error":') ||
    contentStr.includes("ENOENT") ||
    contentStr.includes("EACCES") ||
    contentStr.includes("Permission denied");

  switch (name) {
    case "Glob":
      if (contentStr.includes("No files found") || contentStr.trim() === "") {
        return `   ○ No files found`;
      }
      if (isActualError) return `   ❌ Search failed`;
      const fileCount = (contentStr.match(/\n/g) || []).length + 1;
      return `   ✓ Found ${fileCount} file(s)`;
    case "Grep":
      if (contentStr.includes("No files found") || contentStr.includes("No matches") || contentStr.trim() === "") {
        return `   ○ No matches`;
      }
      if (isActualError) return `   ❌ Search failed`;
      const matchCount = (contentStr.match(/\n/g) || []).length + 1;
      return `   ✓ Found ${matchCount} match(es)`;
    case "Read":
      if (isActualError || contentStr.includes("does not exist")) {
        return `   ❌ File not found`;
      }
      return `   ✓ File loaded`;
    case "Write":
    case "Edit":
      if (isActualError) return `   ❌ Write failed`;
      return `   ✓ File updated`;
    case "Bash":
      if (contentStr.includes("Exit code")) {
        const exitMatch = contentStr.match(/Exit code (\d+)/);
        if (exitMatch && exitMatch[1] !== "0") {
          return `   ⚠ Exited with code ${exitMatch[1]}`;
        }
      }
      if (isActualError) return `   ❌ Command failed`;
      return `   ✓ Completed`;
    case "TodoWrite":
      return `   ✓ Tasks updated`;
    case "Task":
      return `   ✓ Agent finished`;
    default:
      if (isActualError) return `   ❌ Failed`;
      return `   ✓ Done`;
  }
}

// API: Get current iteration log (real-time)
app.get("/api/iteration-log", (req, res) => {
  try {
    const logsDir = join(RALPH_DIR, "logs");
    if (!existsSync(logsDir)) {
      return res.json({ log: null, iteration: null });
    }

    // Find the latest iteration log file
    const files = readdirSync(logsDir)
      .filter((f) => f.startsWith("iteration_") && f.endsWith(".jsonl"))
      .sort()
      .reverse();

    if (files.length === 0) {
      return res.json({ log: null, iteration: null });
    }

    const latestFile = files[0];
    const match = latestFile.match(/iteration_(\d+)\.jsonl/);
    const iteration = match ? parseInt(match[1]) : null;

    const logPath = join(logsDir, latestFile);
    const content = readFileSync(logPath, "utf-8");

    // Parse JSONL and extract formatted content
    const lines = content.split("\n").filter((l) => l.trim());
    let textOutput = "";
    let toolCount = 0;
    const pendingTools = new Map(); // id -> {name, input}
    let lastWasText = false;
    let lastWasTool = false;

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);

        // Extract text from assistant messages
        if (obj.type === "assistant" && obj.message?.content) {
          for (const block of obj.message.content) {
            if (block.type === "text" && block.text) {
              // Clean up the text - remove system reminders
              let text = block.text
                .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
                .trim();
              if (text) {
                if (lastWasTool) textOutput += "\n";
                textOutput += text + "\n\n";
                lastWasText = true;
                lastWasTool = false;
              }
            } else if (block.type === "tool_use") {
              pendingTools.set(block.id, {
                name: block.name,
                input: block.input,
              });
              toolCount++;
              const formatted = formatToolCall(block.name, block.input);
              if (lastWasText) textOutput += "\n";
              textOutput += formatted + "\n";
              lastWasText = false;
              lastWasTool = true;
            }
          }
        }
        // Extract tool results
        else if (obj.type === "user" && obj.message?.content) {
          for (const block of obj.message.content) {
            if (block.type === "tool_result") {
              const result = formatToolResult(
                block.tool_use_id,
                block.content,
                pendingTools
              );
              if (result) {
                textOutput += result + "\n";
              }
            }
          }
        }
        // Extract streaming content deltas
        else if (obj.type === "content_block_delta" && obj.delta?.text) {
          textOutput += obj.delta.text;
          lastWasText = true;
          lastWasTool = false;
        }
      } catch {
        // Skip non-JSON lines
      }
    }

    // Also build structured entries for colored rendering
    const entries = [];
    const pendingTools2 = new Map();

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);

        if (obj.type === "assistant" && obj.message?.content) {
          for (const block of obj.message.content) {
            if (block.type === "text" && block.text) {
              let text = block.text
                .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
                .trim();
              if (text) {
                entries.push({ type: "text", content: text });
              }
            } else if (block.type === "tool_use") {
              pendingTools2.set(block.id, {
                name: block.name,
                input: block.input,
              });
              entries.push({
                type: "tool",
                tool: block.name,
                content: formatToolCall(block.name, block.input),
                id: block.id,
              });
            }
          }
        } else if (obj.type === "user" && obj.message?.content) {
          for (const block of obj.message.content) {
            if (block.type === "tool_result") {
              const tool = pendingTools2.get(block.tool_use_id);
              const contentStr =
                typeof block.content === "string"
                  ? block.content
                  : JSON.stringify(block.content);

              // Check for actual errors (not just word "error" in content)
              const isActualError =
                contentStr.startsWith("Error:") ||
                contentStr.includes('"error":') ||
                contentStr.includes("ENOENT") ||
                contentStr.includes("EACCES") ||
                contentStr.includes("Permission denied") ||
                contentStr.includes("does not exist");

              const isEmpty =
                contentStr.includes("No files found") ||
                contentStr.includes("No matches") ||
                contentStr.trim() === "";

              const resultContent = formatToolResult(
                block.tool_use_id,
                block.content,
                pendingTools2
              );

              // Only add if we have content
              if (resultContent) {
                entries.push({
                  type: "result",
                  tool: tool?.name,
                  status: isActualError ? "error" : isEmpty ? "empty" : "success",
                  content: resultContent,
                  id: block.tool_use_id,
                });
              }
            }
          }
        } else if (obj.type === "content_block_delta" && obj.delta?.text) {
          // Streaming text - append to last text entry or create new
          const lastEntry = entries[entries.length - 1];
          if (lastEntry?.type === "text") {
            lastEntry.content += obj.delta.text;
          } else {
            entries.push({ type: "text", content: obj.delta.text });
          }
        }
      } catch {
        // Skip
      }
    }

    res.json({
      log: textOutput.trim() || "Waiting for output...",
      entries,
      iteration,
      file: latestFile,
      rawLines: lines.length,
      toolCalls: toolCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get standards file
app.get("/api/standards/:language", (req, res) => {
  try {
    const { language } = req.params;
    const standardsPath = join(RALPH_DIR, "standards", `${language}.md`);
    if (!existsSync(standardsPath)) {
      return res.json({ content: `No standards file found for ${language}` });
    }
    const content = readFileSync(standardsPath, "utf-8");
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get Ralph running status
app.get("/api/status", (req, res) => {
  try {
    const statusPath = join(RALPH_DIR, ".ralph-status.json");
    if (!existsSync(statusPath)) {
      return res.json({
        running: false,
        status: "stopped",
        currentIteration: 0,
        maxIterations: 0,
        currentStory: null,
      });
    }
    const content = readFileSync(statusPath, "utf-8");
    const data = JSON.parse(content);
    res.json(data);
  } catch (err) {
    res.json({
      running: false,
      status: "stopped",
      error: err.message,
    });
  }
});

// API: List available task files
app.get("/api/task-files", (req, res) => {
  try {
    const tasksDir = join(RALPH_DIR, "tasks");
    if (!existsSync(tasksDir)) {
      return res.json({ files: [] });
    }
    const files = readdirSync(tasksDir).filter((f) => f.endsWith(".json"));
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: List PRD files available for decomposition
app.get("/api/prd-files", (req, res) => {
  try {
    const files = [];
    // Check specs directory
    if (existsSync(SPECS_DIR)) {
      const specFiles = readdirSync(SPECS_DIR).filter(
        (f) => f.endsWith(".md") && !f.startsWith(".")
      );
      files.push(
        ...specFiles.map((f) => ({
          name: f,
          path: join(SPECS_DIR, f),
          dir: "specs",
        }))
      );
    }
    // Check docs directory
    const docsDir = join(RALPH_DIR, "..", "docs");
    if (existsSync(docsDir)) {
      const docFiles = readdirSync(docsDir).filter(
        (f) => f.endsWith(".md") && !f.startsWith(".")
      );
      files.push(
        ...docFiles.map((f) => ({ name: f, path: join(docsDir, f), dir: "docs" }))
      );
    }
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get decomposition state
app.get("/api/decompose/state", (req, res) => {
  try {
    const statePath = join(RALPH_DIR, "decompose_state.json");
    if (!existsSync(statePath)) {
      return res.json({
        status: "IDLE",
        message: "No decomposition in progress",
      });
    }
    const content = readFileSync(statePath, "utf-8");
    const data = JSON.parse(content);
    res.json(data);
  } catch (err) {
    res.json({ status: "IDLE", error: err.message });
  }
});

// API: Get decomposition draft
app.get("/api/decompose/draft", (req, res) => {
  try {
    // Get draft path from state file
    const statePath = join(RALPH_DIR, "decompose_state.json");
    let draftPath = null;

    if (existsSync(statePath)) {
      const stateContent = readFileSync(statePath, "utf-8");
      const state = JSON.parse(stateContent);
      if (state.draftFile) {
        draftPath = state.draftFile;
      }
    }

    // Fallback to legacy location
    if (!draftPath || !existsSync(draftPath)) {
      draftPath = join(RALPH_DIR, "tasks", "prd.json");
    }

    if (!existsSync(draftPath)) {
      return res.json({ draft: null });
    }
    const content = readFileSync(draftPath, "utf-8");
    const data = JSON.parse(content);
    res.json({ draft: data, draftPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get decomposition feedback
app.get("/api/decompose/feedback", (req, res) => {
  try {
    const feedbackPath = join(RALPH_DIR, "decompose_feedback.json");
    if (!existsSync(feedbackPath)) {
      return res.json({ feedback: null });
    }
    const content = readFileSync(feedbackPath, "utf-8");
    const data = JSON.parse(content);
    res.json({ feedback: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get peer review log (single - latest)
app.get("/api/decompose/review-log", (req, res) => {
  try {
    // Get log path from feedback file
    const feedbackPath = join(RALPH_DIR, "decompose_feedback.json");
    if (!existsSync(feedbackPath)) {
      return res.json({ log: null });
    }

    const feedbackContent = readFileSync(feedbackPath, "utf-8");
    const feedback = JSON.parse(feedbackContent);

    if (!feedback.reviewLog || !existsSync(feedback.reviewLog)) {
      return res.json({ log: null, path: feedback.reviewLog });
    }

    const logContent = readFileSync(feedback.reviewLog, "utf-8");
    res.json({ log: logContent, path: feedback.reviewLog });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get all peer review logs from state
app.get("/api/decompose/review-logs", (req, res) => {
  try {
    const statePath = join(RALPH_DIR, "decompose_state.json");
    if (!existsSync(statePath)) {
      return res.json({ logs: [] });
    }

    const stateContent = readFileSync(statePath, "utf-8");
    const state = JSON.parse(stateContent);
    const reviewLogs = state.reviewLogs || [];

    // Read content of each log file
    const logsWithContent = reviewLogs.map((entry) => {
      let content = null;
      if (entry.path && existsSync(entry.path)) {
        content = readFileSync(entry.path, "utf-8");
      }
      return {
        attempt: entry.attempt,
        path: entry.path,
        content,
      };
    });

    res.json({ logs: logsWithContent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Submit task feedback for Claude to update a specific task
app.post("/api/decompose/task-feedback", async (req, res) => {
  try {
    const { taskId, feedback, prdFile } = req.body;

    if (!taskId || !feedback) {
      return res.status(400).json({ error: "taskId and feedback are required" });
    }

    // Get draft file path from state
    const statePath = join(RALPH_DIR, "decompose_state.json");
    let draftPath = null;
    let prdPath = prdFile;

    if (existsSync(statePath)) {
      const stateContent = readFileSync(statePath, "utf-8");
      const state = JSON.parse(stateContent);
      draftPath = state.draftFile;
      if (!prdPath) prdPath = state.prdFile;
    }

    if (!draftPath || !existsSync(draftPath)) {
      return res.status(400).json({ error: "No draft file found" });
    }

    // Run the task feedback script
    const scriptPath = join(RALPH_DIR, "task_feedback.sh");
    if (!existsSync(scriptPath)) {
      return res.status(500).json({ error: "Task feedback script not found" });
    }

    // Write feedback to temp file to avoid shell escaping issues
    const feedbackFile = join(RALPH_DIR, ".task_feedback_input.txt");
    writeFileSync(feedbackFile, feedback);

    const args = [taskId, feedbackFile, draftPath];
    if (prdPath) args.push(prdPath);

    const { spawn } = await import("child_process");
    const proc = spawn("bash", [scriptPath, ...args], {
      cwd: RALPH_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, FEEDBACK_FROM_FILE: "1" },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
      console.log("[task-feedback]", data.toString().trim());
    });
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
      console.error("[task-feedback]", data.toString().trim());
    });

    proc.on("close", (code) => {
      // Clean up temp file
      try { unlinkSync(feedbackFile); } catch {}

      if (code !== 0) {
        console.error("Task feedback failed with code", code);
        const errorMsg = stderr.trim() || "Failed to update task";
        return res.status(500).json({ error: errorMsg });
      }
      console.log("Task feedback completed:", stdout.trim());
      res.json({ success: true, message: "Task updated" });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Start decomposition
let decomposeProcess = null;
app.post("/api/decompose/start", (req, res) => {
  try {
    const { prdFile, branch, language, forceRedecompose } = req.body;

    if (!prdFile) {
      return res.status(400).json({ error: "prdFile is required" });
    }

    if (decomposeProcess) {
      return res.status(400).json({ error: "Decomposition already in progress" });
    }

    // Build command arguments
    const args = [prdFile];
    if (branch) {
      args.push("-b", branch);
    }
    if (language) {
      args.push("-l", language);
    }
    if (forceRedecompose) {
      args.push("-r");
    }

    // Reset state file
    const statePath = join(RALPH_DIR, "decompose_state.json");
    writeFileSync(
      statePath,
      JSON.stringify({
        status: "STARTING",
        message: "Starting decomposition...",
        prdFile,
        branch: branch || "ralph/feature",
      })
    );

    // Clear old feedback file so stale logs don't appear
    const feedbackPath = join(RALPH_DIR, "decompose_feedback.json");
    if (existsSync(feedbackPath)) {
      unlinkSync(feedbackPath);
    }

    // Start decompose.sh
    const decomposePath = join(RALPH_DIR, "decompose.sh");
    decomposeProcess = spawn("bash", [decomposePath, ...args], {
      cwd: RALPH_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    decomposeProcess.stdout.on("data", (data) => {
      output += data.toString();
    });
    decomposeProcess.stderr.on("data", (data) => {
      output += data.toString();
    });

    decomposeProcess.on("close", (code) => {
      decomposeProcess = null;
      console.log(`Decompose finished with code ${code}`);
    });

    res.json({ success: true, message: "Decomposition started" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Activate tasks (copy draft to prd.json and clean up)
app.post("/api/decompose/activate", (req, res) => {
  try {
    const statePath = join(RALPH_DIR, "decompose_state.json");
    const targetPath = join(RALPH_DIR, "prd.json");
    let draftPath = null;

    // Get draft path from state file
    if (existsSync(statePath)) {
      const stateContent = readFileSync(statePath, "utf-8");
      const state = JSON.parse(stateContent);
      if (state.draftFile) {
        draftPath = state.draftFile;
      }
    }

    // Fallback to legacy location
    if (!draftPath || !existsSync(draftPath)) {
      draftPath = join(RALPH_DIR, "tasks", "prd.json");
    }

    if (!existsSync(draftPath)) {
      return res.status(400).json({ error: "No draft tasks to activate" });
    }

    // Copy draft to active prd.json
    copyFileSync(draftPath, targetPath);

    // Clean up: remove draft file and reset state
    try {
      unlinkSync(draftPath);

      // Reset decompose state
      writeFileSync(statePath, JSON.stringify({
        status: "IDLE",
        message: "Tasks activated successfully",
        updatedAt: new Date().toISOString()
      }));
    } catch (cleanupErr) {
      console.warn("Cleanup warning:", cleanupErr.message);
    }

    res.json({ success: true, message: "Tasks activated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Execute a single task (append to prd.json and remove from source)
app.post("/api/decompose/execute-task", (req, res) => {
  try {
    const { task, projectName, branchName, language, sourceFile } = req.body;

    if (!task) {
      return res.status(400).json({ error: "No task provided" });
    }

    const targetPath = join(RALPH_DIR, "prd.json");
    let existingData = null;

    // Check if prd.json exists and load it
    if (existsSync(targetPath)) {
      try {
        const content = readFileSync(targetPath, "utf-8");
        existingData = JSON.parse(content);
      } catch (parseErr) {
        console.warn("Could not parse existing prd.json:", parseErr.message);
      }
    }

    if (existingData && existingData.userStories) {
      // Check if task already exists
      const exists = existingData.userStories.some(s => s.id === task.id);
      if (exists) {
        return res.status(400).json({ error: `Task ${task.id} already exists in prd.json` });
      }
      // Append the task
      existingData.userStories.push(task);
    } else {
      // Create new prd.json with just this task
      existingData = {
        projectName: projectName || "Ralph Project",
        branchName: branchName || "ralph/feature",
        language: language || "C#",
        userStories: [task]
      };
    }

    // Write the updated prd.json
    writeFileSync(targetPath, JSON.stringify(existingData, null, 2));

    // Remove the task from the source file if provided
    if (sourceFile && existsSync(sourceFile)) {
      try {
        const sourceContent = readFileSync(sourceFile, "utf-8");
        const sourceData = JSON.parse(sourceContent);
        if (sourceData.userStories) {
          sourceData.userStories = sourceData.userStories.filter(s => s.id !== task.id);
          writeFileSync(sourceFile, JSON.stringify(sourceData, null, 2));
          console.log(`Removed task ${task.id} from source file: ${sourceFile}`);
        }
      } catch (sourceErr) {
        console.warn("Could not update source file:", sourceErr.message);
      }
    }

    res.json({
      success: true,
      message: `Task ${task.id} added to prd.json`,
      totalTasks: existingData.userStories.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Start Ralph
let ralphProcess = null;
app.post("/api/ralph/start", (req, res) => {
  try {
    const { iterations = 25 } = req.body;

    if (ralphProcess) {
      return res.status(400).json({ error: "Ralph is already running" });
    }

    const ralphPath = join(RALPH_DIR, "ralph.sh");
    ralphProcess = spawn("bash", [ralphPath, String(iterations)], {
      cwd: RALPH_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    });

    ralphProcess.on("close", (code) => {
      ralphProcess = null;
      console.log(`Ralph finished with code ${code}`);
    });

    res.json({ success: true, message: "Ralph started" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Stop Ralph
app.post("/api/ralph/stop", (req, res) => {
  try {
    if (ralphProcess) {
      ralphProcess.kill("SIGTERM");
      ralphProcess = null;
      res.json({ success: true, message: "Ralph stopped" });
    } else {
      res.json({ success: false, message: "Ralph is not running" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve static files in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(join(__dirname, "dist")));
  app.get("*", (req, res) => {
    res.sendFile(join(__dirname, "dist", "index.html"));
  });
}

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
  console.log(`Ralph Web API running at http://localhost:${PORT}`);
  console.log(`Serving data from: ${RALPH_DIR}`);
});
