<div align="center">
  <img src="assets/avatar.png" alt="Speki the Owl" width="300" />
  <h1>Welcome to SPEKI — where specs are a hoot!</h1>
</div>

---

**Spec-First AI Development** — Write specs, get working code. SPEKI transforms your product requirements into atomic tasks and executes them using Claude Code.

> **The Problem**: AI coding assistants are powerful but directionless. They need clear, well-structured requirements to produce quality code.
>
> **The Solution**: SPEKI enforces a spec-first workflow where AI reviews your specs, decomposes them into tasks, and executes them one at a time with full test coverage.

---

## Features at a Glance

### 1. Multi-Project Dashboard

**Stop context-switching between terminals.** Manage all your AI development projects from one place. Instantly see which projects have pending specs, active tasks, or running executions. Jump between projects without losing your place.

*Perfect for teams juggling multiple features, services, or client projects.*

![Manage and create projects](assets/1.%20Manage%20and%20create%20projects.png)

---

### 2. Spec Management

**Your specs are your source of truth.** SPEKI automatically tracks every PRD, technical spec, and bug report through its lifecycle—from draft to reviewed to implemented. No more "where's that spec?" or "did we build that yet?"

*Color-coded status indicators show exactly where each spec stands at a glance.*

![Manage PRDs, SPECs, and BUGs](assets/2.%20Manage%20PRDs_SPECs_BUGs.png)

---

### 3. AI-Powered User Story Generation

**Turn vague requirements into buildable tasks.** One PRD becomes 10-20 atomic user stories, each with acceptance criteria, test cases, and dependency ordering. No more ambiguity about what "done" means.

*The AI understands your codebase context and generates stories that actually fit your architecture.*

![Generate User Stories](assets/3.%20Generate%20User%20Stories.png)

---

### 4. Technical Spec Generation

**Bridge the gap between product and engineering.** Generate detailed technical specs from your PRDs automatically. API contracts, data models, component structures—all derived from your requirements.

*Tech specs become living documents that stay in sync with your PRDs.*

![Generate Tech Spec](assets/4.%20Generate%20Tech%20spec.png)

---

### 5. AI Specialist Reviewers

**Catch problems before they become code.** Multiple AI specialists analyze your specs for missing requirements, contradictions, security gaps, and implementation risks. It's like having a senior architect review every document.

*Fix issues when they're cheap (in the spec) instead of expensive (in production).*

![AI Specialist Reviewers](assets/5.%20Use%20AI%20Specialist%20Reviewers.png)

---

### 6. Contextual Spec Chat

**AI that actually knows what you're working on.** Unlike generic chatbots, SPEKI's assistant sees your entire spec. Ask "what happens if the user cancels mid-checkout?" and get answers grounded in YOUR requirements.

*No more copy-pasting context into ChatGPT. The AI already has it.*

![Reference spec for chat](assets/6.%20Reference%20spec%20for%20chat.png)

---

### 7. Interactive Refinement

**Iterate until it's bulletproof.** Have a conversation to clarify edge cases, add missing requirements, or rethink approaches. When you approve a change, the AI edits the spec directly—no manual updates.

*Your specs evolve through dialogue, not document archaeology.*

![Interactive chat with your spec](assets/7.%20Interactive%20chat%20with%20your%20spec.png)

---

### 8. Task Decomposition

**From spec to sprint-ready backlog in minutes.** One click transforms your reviewed spec into a dependency-ordered task list. Each task is small enough to implement in one session, with clear acceptance criteria and test requirements.

*No more grooming meetings to break down stories. The AI does it.*

![Generate technical tasks](assets/8.%20Generate%20technical%20tasks.png)

---

### 9. Automated Execution

**Watch your spec become working code.** Queue tasks and let Claude Code implement them one by one. Each task runs tests, commits on success, and moves to the next. You review the PRs, not the keystrokes.

*Go from PRD to pull request while you grab coffee.*

![Queue and execute tasks](assets/9.%20Queue%20and%20execute%20tasks.png)

---

## Quick Start

### Prerequisites

<details>
<summary><strong>Node.js 18+</strong> — via nvm or direct download</summary>

**Using nvm (recommended):**
```bash
# Install nvm via curl
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.2/install.sh | bash

# Or via Homebrew (macOS)
brew install nvm
```

**Or download directly:** [nodejs.org](https://nodejs.org/)

</details>

<details>
<summary><strong>AI Coding Assistant</strong> — Claude Code or Codex CLI</summary>

SPEKI works with either:

- **Claude Code** — `claude --version` to verify ([install guide](https://docs.anthropic.com/en/docs/claude-code))
- **Codex CLI** — `codex --version` to verify ([install guide](https://github.com/openai/codex))

</details>

### Installation

```bash
# Clone the repo
git clone git@github.com:QalaTech/speki.git
cd speki

# Ensure Node 18+ (if using nvm)
nvm install 20
nvm use 20

# Install dependencies and build
npm install
npm run build

# Install global command
./install.sh

# Verify
qala --help
```

### Your First Project

```bash
# Launch the dashboard (from speki directory)
qala dashboard
```

From the dashboard:
1. Click **New Project** and select your project directory
2. Add a spec file to the `specs/` folder
3. Select your spec from the file tree
4. Click **Review** to get AI feedback
5. Click **Decompose** to generate tasks
6. Click **Execute** to start implementation

---

## The Spec-First Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SPEKI WORKFLOW                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐            │
│   │  Write   │    │  Review  │    │Decompose │    │ Execute  │            │
│   │   Spec   │───▶│  & Chat  │───▶│  Tasks   │───▶│  & Test  │            │
│   └──────────┘    └──────────┘    └──────────┘    └──────────┘            │
│                                                                             │
│   PRD/Tech Spec   AI Reviewers    Atomic Tasks    Claude Code              │
│   Bug Reports     Interactive     Dependencies    Auto-Commit              │
│   Requirements    Refinement      Test Cases      Progress Logs            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why Spec-First?

| Traditional AI Coding | SPEKI Approach |
|----------------------|----------------|
| Vague prompts → inconsistent results | Clear specs → predictable output |
| One-shot generation → lots of fixes | Iterative refinement → fewer bugs |
| No test coverage → fragile code | Tests required → reliable code |
| Context lost between sessions | Full spec context preserved |

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `qala init` | Initialize project in current directory |
| `qala dashboard` | Launch the web dashboard |
| `qala decompose <spec>` | Decompose a spec file into tasks |
| `qala start` | Start the execution loop |
| `qala stop` | Stop execution |
| `qala status` | Show current project status |
| `qala list` | List all registered projects |
| `qala tasks list` | List all tasks with status |
| `qala tasks next` | Show next pending task |

See [CLI Reference](docs/cli-reference.md) for all options.

---

## Project Structure

### SPEKI Monorepo

```
speki/
├── packages/
│   ├── core/      # @speki/core - Business logic & types
│   ├── server/    # @speki/server - Express API
│   ├── cli/       # @speki/cli - CLI commands
│   └── web/       # @speki/web - React dashboard
├── docs/          # Documentation
└── assets/        # Screenshots
```

### Per-Project Structure

```
your-project/
├── specs/                    # Your spec files (PRDs, tech specs, bugs)
│   ├── auth-feature.md
│   └── payment-system.md
└── .speki/                   # SPEKI state (auto-managed)
    ├── config.json           # Project settings
    ├── progress.txt          # Execution history
    ├── prompt.md             # Claude instructions
    ├── standards/            # Language coding standards
    └── specs/                # Per-spec state
        └── <spec-id>/
            ├── session.json  # Review chat history
            ├── tasks.json    # Decomposed tasks
            └── logs/         # Execution logs
```

---

## Documentation

- [Getting Started](docs/getting-started.md) — Detailed setup guide
- [CLI Reference](docs/cli-reference.md) — All commands and options
- [Architecture](docs/architecture.md) — Technical design
- [Configuration](docs/configuration.md) — Config files reference
- [Roadmap](docs/roadmap.md) — Planned features and timeline

---

## Troubleshooting

**"command not found: qala"**
```bash
cd /path/to/speki && ./install.sh
```

**Dashboard won't start**
```bash
qala dashboard -p 3006  # Try different port
```

**Claude not responding**
```bash
claude --version        # Verify installed
claude "Hello"          # Test authentication
```

---

## License

Proprietary. See [LICENSE](LICENSE) for details.

© 2025 QalaTech. All Rights Reserved.
