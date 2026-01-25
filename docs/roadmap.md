# SPEKI Roadmap

## 1. Cross-Repository PRD Management

**Status:** Planned

Enable PRDs and specs to span multiple repositories, supporting monorepos and microservice architectures.

- Central PRD registry that references multiple repos
- Task decomposition that generates tasks targeting specific repos
- Execution orchestration across repo boundaries
- Unified progress tracking and reporting

---

## 2. Marketplace MCP Integrations

**Status:** Planned

Integrate with enterprise tools via MCP (Model Context Protocol) for full lifecycle support.

### Target Integrations

| Platform | Capabilities |
|----------|-------------|
| **Confluence** | Import specs from pages, sync documentation |
| **JIRA** | Bi-directional task sync, status updates, sprint planning |
| **Azure DevOps** | Work items, boards, pipelines integration |
| **GitHub** | Issues, PRs, project boards, actions |
| **Linear** | Issue tracking, cycle planning |
| **Notion** | Spec authoring, knowledge base sync |

### Features
- Import existing specs/requirements from connected tools
- Push generated tasks to project management systems
- Real-time status sync during execution
- Automated PR/issue creation on task completion

---

## 3. Multi-User Collaboration

**Status:** Planned

Enable teams to collaborate on the same PRD simultaneously.

- Real-time collaborative spec editing
- Role-based access (author, reviewer, executor)
- Review workflows with approval gates
- Comment threads and @mentions
- Conflict resolution for concurrent edits
- Activity feed and notifications
- Team dashboards with aggregate progress

---

## 4. Supreme AI Execution Setup

**Status:** Planned

Optimize Claude Code / Codex local configuration to achieve >95% task execution accuracy.

### Configuration Templates
- Curated `.claude/` and prompt configurations
- Language-specific coding standards
- Test-first execution patterns
- Error recovery and retry strategies

### Execution Improvements
- Pre-flight checks before task execution
- Automated context gathering (dependencies, related files)
- Incremental validation after each step
- Rollback on failure with diagnostic reports

### Metrics & Feedback
- Execution success rate tracking
- Common failure pattern analysis
- Configuration recommendations based on project type
- Benchmark comparisons across setups

---

## Timeline

All features targeted for **Q1 2026**.

---

*Last updated: January 2026*
