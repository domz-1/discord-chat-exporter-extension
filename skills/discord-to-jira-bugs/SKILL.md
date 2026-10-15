---
name: discord-to-jira-bugs
description: Converts exported Discord chat discussions (in TOON or JSON format) into verified, audited Jira bug tickets with code references across frontend and backend.
---

# Discord to Jira Bugs Skill

This skill transforms Discord QA bug reports and discussions into high-precision, audited Jira bug tickets. It takes message threads exported via the **Discord Chat Exporter** extension (in TOON, JSON, or text format), cross-references the issue with the local codebase (`seen/client` and `seen/backend`), identifies the true technical layer (Frontend vs Backend vs Business logic), and creates or updates tickets via `jira-sync`.

## When to Use
- When the user pastes Discord QA reports, chat snippets, or screenshots/attachments exported in TOON or JSON format.
- When creating Jira bugs directly from Discord bug discussion threads.
- When doing technical audits of newly reported bugs against `seen/client` and `seen/backend` codebases.

---

## Input Formats Supported
1. **TOON (Token-Oriented Object Notation)**:
   ```text
   [count]{id,author,time,link,reply_to,attachments,content}:
   ...
   ```
2. **JSON**:
   ```json
   [
     {
       "id": "...",
       "author": "...",
       "time": "...",
       "link": "...",
       "reply_to": "...",
       "attachments": [...],
       "content": "..."
     }
   ]
   ```
3. **Raw Text / Markdown** with Discord message links and attached screenshot URLs.

---

## Workflow Steps

### Step 1: Parse & Group Messages into Distinct Issues
- Read through the TOON/JSON rows.
- Group messages by bug or topic (resolving replies to original messages).
- Extract:
  - **Reporter**: original author of the bug report.
  - **Discord Message Links**: permanent Discord URL.
  - **Attachments**: image/video URLs demonstrating the bug.
  - **Steps & Symptoms**: what happened vs expected behavior.

### Step 2: Code Audit (Frontend vs Backend Deep Dive)
Before writing or proposing any ticket:
1. Search the relevant files in the client repo (`/home/adham/projects/neop/seen/client/src/`).
2. Search the relevant files in the backend repo (`/home/adham/projects/neop/seen/backend/src/`).
3. Determine the real root cause:
   - **Frontend Bug**: UI rendering, state management (Pinia/Redux/etc.), incorrect API payload parsing, missing UI guards.
   - **Backend Bug**: Missing DB migration, unhandled webhook event, incorrect HTTP response status/format, SQL/ORM logic error.
   - **Business/Spec Bug**: Behavior matches current code, but contradicts business workflow.
4. Pinpoint exact file paths and line ranges (e.g., `client/src/services/SeenMessengerService.ts#L120-L145`).

### Step 3: Format Jira ADF Payload
Tickets must use Atlassian Document Format (ADF) or the structured markdown template supported by `jira-sync`:
- **Title**: Clear summary prefixed with feature/module (e.g., `[Chat/Seen] Incoming messages marked as seen immediately`).
- **Description**:
  - **Issue Summary**: Clear statement of the bug.
  - **Reported in Discord**: Author, timestamp, Discord permalink.
  - **Evidence / Attachments**: Markdown image links and media URLs.
  - **Technical Root Cause**: Audit findings, exact code paths, and lines.
  - **Layer Classification**: `Frontend (client)` vs `Backend (server)`.
  - **Proposed Solution**: Concrete fix steps with code snippets.

### Step 4: Dispatch via `jira-sync` CLI
Execute `jira-sync` to push to Jira:
```bash
bun /home/adham/tools/jira-bug-sync/src/cli.js --project SV2 --type Bug --title "..." --file "/path/to/spec.md"
```
Or update existing tickets without duplicate creation if modifying existing keys.

---

## Guidelines & Strict Rules
- **Package Manager**: Always use `bun` for any node/bun commands.
- **Git Commits**: Write all commit messages in lowercase only.
- **Accuracy**: Never classify a bug as "Frontend" or "Backend" without checking both codebases using ripgrep or file view.
- **Tokens**: Prioritize TOON input to keep context lean and prevent truncation.
