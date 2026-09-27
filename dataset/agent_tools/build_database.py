#!/usr/bin/env python3
"""Build the source-linked developer-agent tool catalog and SQLite database."""

import csv
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "agent_tools.sqlite"
CSV_PATH = ROOT / "tools.csv"
SOURCES_PATH = ROOT / "sources.csv"

SOURCES = [
    ("OAI_CLI", "OpenAI", "Codex developer commands", "https://learn.chatgpt.com/docs/developer-commands", "Codex CLI and desktop command reference"),
    ("OAI_TOOLS", "OpenAI", "Using tools", "https://developers.openai.com/api/docs/guides/tools", "Official API agent tools overview"),
    ("OAI_PATCH", "OpenAI", "Apply Patch", "https://developers.openai.com/api/docs/guides/tools-apply-patch", "Official structured patch tool reference"),
    ("OAI_MCP", "OpenAI", "Docs MCP", "https://developers.openai.com/learn/docs-mcp", "OpenAI documentation MCP capabilities and setup"),
    ("CLAUDE_CLI", "Anthropic", "Claude Code CLI reference", "https://code.claude.com/docs/en/cli-reference", "CLI subcommands, flags, and interactive command links"),
    ("CLAUDE_SLASH", "Anthropic", "Claude Code slash commands", "https://code.claude.com/docs/en/slash-commands", "Built-in slash commands and custom skills"),
    ("CLAUDE_PERMS", "Anthropic", "Claude Code permissions", "https://code.claude.com/docs/en/permissions", "Tool names and permission behavior"),
    ("CURSOR_TOOLS", "Cursor", "Agent tools", "https://docs.cursor.com/en/agent/tools", "Built-in Agent search, edit, run, and MCP categories"),
    ("CURSOR_MCP", "Cursor", "Model Context Protocol", "https://docs.cursor.com/context/model-context-protocol", "MCP capabilities, transports, configuration"),
    ("CURSOR_MODES", "Cursor", "Agent modes", "https://docs.cursor.com/en/agent/modes", "Agent, Ask, and custom modes"),
    ("AGY_SDK", "Google Antigravity", "Tools and skills", "https://www.antigravity.google/docs/sdk/tools/", "Official SDK built-in tools and identifiers"),
    ("AGY_CLI", "Google Antigravity", "CLI reference", "https://www.antigravity.google/docs/cli/reference/", "CLI commands, conversation, context and tool controls"),
    ("AGY_SLASH", "Google Antigravity", "Slash commands overview", "https://www.antigravity.google/docs/slash-commands", "Cross-surface command reference"),
    ("AGY_FEATURES", "Google Antigravity", "Feature overview", "https://antigravity.google/docs/features", "Browser agent, terminal and version-control features"),
    ("AGY_IDE", "Google Antigravity", "IDE overview", "https://www.antigravity.google/docs/ide/overview/", "IDE agent/editor/browser surfaces"),
    ("GH_CUSTOM", "GitHub Copilot", "Custom agents configuration", "https://docs.github.com/en/copilot/reference/custom-agents-configuration", "Tool aliases and MCP-configured tools"),
    ("GH_CLI", "GitHub Copilot", "Copilot CLI command reference", "https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference", "CLI built-ins and slash commands"),
    ("GH_SEARCH", "GitHub Copilot", "Loading tools on demand with tool search", "https://docs.github.com/en/copilot/concepts/agents/copilot-cli/tool-search", "Built-in CLI tools and deferred MCP tools"),
    ("AIDER_CMDS", "Aider", "In-chat commands", "https://aider.chat/docs/usage/commands.html", "Aider command names and descriptions"),
    ("AIDER_MODES", "Aider", "Chat modes", "https://aider.chat/docs/usage/modes.html", "Aider code, ask, architect and help modes"),
    ("AIDER_TEST", "Aider", "Linting and testing", "https://aider.chat/docs/usage/lint-test.html", "Aider test, lint and run behavior"),
    ("AIDER_GIT", "Aider", "Git integration", "https://aider.chat/docs/git.html", "Aider diff, undo, commit and Git integration"),
    ("GEMINI_TOOLS", "Google", "Gemini CLI tools reference", "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/tools.md", "Official Gemini CLI tool names, categories and operations"),
    ("CLINE_TOOLS", "Cline", "All Cline tools", "https://github.com/cline/cline/blob/main/docs/tools-reference/all-cline-tools.mdx", "Cline-maintained built-in tool reference; current ClineCore names"),
    ("OPENCODE_TOOLS", "OpenCode", "Tools", "https://opencode.ai/docs/tools/", "Official OpenCode tool names, parameters and permissions"),
]

# Tuple fields after product/surface: name, type, plain-language function, MCP relationship, source ID, verification note.
ROWS = []

def add(product, surface, source, entries, mcp="Native product capability"):
    for name, kind, function in entries:
        ROWS.append((product, surface, name, kind, function, mcp, source,
                     "Documented by the vendor; availability may vary by product version or configuration."))

add("Codex", "CLI / desktop", "OAI_CLI", [
    ("/compact", "Slash command", "Summarize the current chat to free context while retaining key points."),
    ("/diff", "Slash command", "Show the working-tree diff, including untracked files."),
    ("/mcp", "Slash command", "Show status for connected MCP servers."),
    ("/review", "Slash command", "Review uncommitted changes or compare changes with a base branch."),
    ("/worktree", "Slash command", "Run work in a separate Git worktree."),
    ("/plan", "Slash command", "Toggle planning mode for a multi-step task."),
    ("/init", "Slash command", "Create an AGENTS.md instruction-file scaffold for the current project."),
    ("/memories", "Slash command", "Configure memory use and memory generation."),
    ("/skills", "Slash command", "Browse and invoke available skills."),
    ("/status", "Slash command", "Show chat ID, context usage, and rate limits."),
    ("codex mcp", "CLI command", "List, add, remove, or authenticate external MCP server connections."),
])
add("OpenAI agent tools (API)", "API / runtime", "OAI_TOOLS", [
    ("Shell", "Built-in tool", "Run shell commands in a hosted container or a developer-provided local runtime."),
    ("Apply Patch", "Built-in tool", "Propose structured file create, update, and delete diffs for the host runtime to apply."),
    ("Web search", "Built-in tool", "Retrieve current internet information for use in a model response."),
    ("Computer use", "Built-in tool", "Control a computer interface through a computer-use workflow."),
    ("File search", "Built-in tool", "Retrieve relevant content from files uploaded to the API."),
    ("Code interpreter", "Built-in tool", "Run code in a managed execution environment for analysis and computation."),
    ("Function calling", "Tool interface", "Let the model request application-defined functions; the host application executes them."),
    ("Remote MCP servers", "MCP integration", "Connect model requests to tools exposed by configured remote MCP servers."),
    ("Tool search", "Built-in tool", "Find and load tool definitions on demand to reduce upfront tool context."),
    ("Programmatic tool calling", "Built-in tool", "Let a model compose and execute JavaScript that orchestrates tool calls."),
], "MCP integration is external; names and behavior are defined by each connected server.")
add("OpenAI Developer Docs MCP", "MCP server", "OAI_MCP", [
    ("Search documentation", "MCP tool", "Search OpenAI developer, platform, and Learn documentation."),
    ("Read documentation page", "MCP tool", "Retrieve page content from OpenAI developer documentation."),
], "This named MCP server exposes read-only documentation tools; it does not call the OpenAI API.")

add("Claude Code", "CLI", "CLAUDE_CLI", [
    ("claude -c / --continue", "CLI command", "Continue the most recent conversation in the current project."),
    ("claude -r / --resume", "CLI command", "Resume a conversation by session ID or select a previous session."),
    ("claude mcp", "CLI command", "Configure Model Context Protocol servers."),
    ("--print (-p)", "CLI flag", "Run a non-interactive prompt and print the result."),
    ("--output-format", "CLI flag", "Choose text, JSON, or streaming JSON output for print mode."),
    ("--permission-mode", "CLI flag", "Choose the permission mode at session start."),
    ("--allowedTools / --disallowedTools", "CLI flags", "Allow or block named tools or matching tool calls."),
])
add("Claude Code", "CLI / IDE / desktop", "CLAUDE_SLASH", [
    ("/compact", "Slash command", "Summarize earlier conversation context to make room for more work."),
    ("/clear", "Slash command", "Clear the current conversation and start a fresh context."),
    ("/resume", "Slash command", "Open a prior conversation for continuation."),
    ("/rewind", "Slash command", "Restore an earlier point in the conversation or code changes."),
    ("/model", "Slash command", "Choose or switch the model for the session."),
    ("/permissions", "Slash command", "View and change which tool actions require approval."),
    ("/mcp", "Slash command", "View MCP server status and available connected tools."),
    ("/context", "Slash command", "Inspect context-window usage and what is consuming context."),
    ("/agents", "Slash command", "Manage or inspect subagents."),
], "MCP tools are supplied by connected servers and can be controlled through Claude Code.")
add("Claude Code", "CLI agent tools", "CLAUDE_PERMS", [
    ("Bash", "Built-in tool", "Run shell commands, scripts, and command-line programs."),
    ("Read", "Built-in tool", "Read files and inspect supported file content."),
    ("Write", "Built-in tool", "Create or replace file contents."),
    ("Edit", "Built-in tool", "Make targeted edits to existing files."),
    ("Glob", "Built-in tool", "Find files by path pattern."),
    ("Grep", "Built-in tool", "Search file contents using text or regular expressions."),
    ("WebSearch", "Built-in tool", "Search the web for information."),
    ("WebFetch", "Built-in tool", "Fetch and process content from a specified URL."),
    ("Task", "Built-in tool", "Delegate a bounded task to a subagent."),
    ("TodoWrite", "Built-in tool", "Create and update a task checklist."),
    ("NotebookEdit", "Built-in tool", "Edit Jupyter notebook cells."),
    ("AskUserQuestion", "Built-in tool", "Ask the user a structured question during the task."),
], "MCP is an extension mechanism; these are Claude Code tool names, not MCP server tools.")

add("Cursor", "IDE Agent", "CURSOR_TOOLS", [
    ("Read File", "Built-in tool", "Read a file selected by the agent."),
    ("List Directory", "Built-in tool", "List files and folders in a directory."),
    ("Codebase", "Built-in tool", "Search indexed project code for relevant context."),
    ("Grep", "Built-in tool", "Search file contents for matching text or patterns."),
    ("Search Files", "Built-in tool", "Find files using search criteria or patterns."),
    ("Web", "Built-in tool", "Search the web for relevant information."),
    ("Fetch Rules", "Built-in tool", "Retrieve applicable Cursor project rules."),
    ("Edit & Reapply", "Built-in tool", "Apply code edits and retry/reapply when an edit needs adjustment."),
    ("Delete File", "Built-in tool", "Delete a project file."),
    ("Terminal", "Built-in tool", "Run commands in the configured terminal profile."),
    (("Toggle MCP Servers"), "MCP control", "Enable or disable configured MCP servers and their tools."),
], "Cursor supports configured external MCP servers; each server defines its own tool names and actions.")
add("Cursor", "IDE Agent", "CURSOR_MODES", [
    ("Agent mode", "Agent mode", "Autonomously explore the codebase, edit multiple files, run commands, and address errors."),
    ("Ask mode", "Agent mode", "Search and explain code without automatically making changes."),
    ("Custom modes", "Agent mode", "Define a specialized mode by selecting tools and instructions."),
])
add("Cursor", "IDE / MCP", "CURSOR_MCP", [
    ("MCP tools", "MCP integration", "Call tools exposed by configured MCP servers to reach external services or data."),
    ("MCP prompts", "MCP integration", "Use templated prompts exposed by an MCP server."),
    ("MCP roots", "MCP integration", "Use server-initiated workspace or filesystem boundary information."),
    ("MCP elicitation", "MCP integration", "Handle server-initiated requests for additional user input."),
], "These are MCP protocol capabilities; concrete tool names are server-defined.")

add("Google Antigravity SDK", "Agent SDK", "AGY_SDK", [
    ("list_directory", "Built-in tool", "List directory contents."),
    ("search_directory", "Built-in tool", "Search within files in a directory."),
    ("find_file", "Built-in tool", "Find files by pattern."),
    ("view_file", "Built-in tool", "Read file contents."),
    ("create_file", "Built-in tool", "Create a file."),
    ("edit_file", "Built-in tool", "Edit an existing file."),
    ("run_command", "Built-in tool", "Execute a shell command."),
    ("ask_question", "Built-in tool", "Prompt the user for input."),
    ("start_subagent", "Built-in tool", "Start a child agent for delegated work."),
    ("generate_image", "Built-in tool", "Generate or edit an image."),
    ("search_web", "Built-in tool", "Search the web using Google Search."),
    ("read_url_content", "Built-in tool", "Fetch and read content from a URL."),
    ("finish", "Built-in tool", "Return the agent's final output."),
    ("Custom Python function", "Custom tool", "Register an application-defined Python function for the agent to call."),
], "MCP servers can be registered separately; MCP tool names and behavior come from those servers.")
add("Google Antigravity", "CLI / IDE", "AGY_SLASH", [
    ("/browser", "Slash command", "Launch a browser subagent for web research, page inspection, and UI verification."),
    ("/btw", "Slash command", "Ask an out-of-band question while the primary agent keeps running."),
    ("/mcp", "Slash command", "Open the MCP server manager."),
    ("/compact", "Slash command", "Summarize the current conversation to reduce context use."),
    ("/new", "Slash command", "Start a fresh conversation."),
    ("/resume", "Slash command", "Select and continue a previous conversation."),
    ("/rewind", "Slash command", "Return conversation state to an earlier point."),
    ("/diff", "Slash command", "Open a diff viewer to review agent edits."),
    ("/tasks", "Slash command", "View and manage background task or shell execution activity."),
    ("/skills", "Slash command", "Browse available agent skills."),
    ("/planning", "Slash command", "Enable multi-turn planning for a complex task."),
    ("/permissions", "Slash command", "Open the tool permission controls."),
    ("/usage", "Slash command", "Display model quota or usage information."),
])
add("Google Antigravity", "IDE", "AGY_FEATURES", [
    ("Browser subagent", "Agent capability", "Navigate web pages, inspect DOM, record browser activity, and verify frontend layouts."),
    ("Integrated terminal", "IDE capability", "Run terminal commands from the IDE sidebar."),
    ("VCS review panel", "IDE capability", "Inspect working-tree, branch, and agent-edit diffs; stage, discard, commit, and push."),
    ("Chrome DevTools MCP integration", "MCP integration", "Connect browser-agent workflows to Chrome DevTools capabilities."),
], "Chrome DevTools integration uses MCP; exact exposed tool set depends on the configured server.")
add("Google Antigravity", "IDE", "AGY_IDE", [
    ("Editor agent", "Agent capability", "Work with project code in the editor, including code changes and end-to-end tasks."),
    ("Browser agent", "Agent capability", "Operate a browser to inspect sites and perform UI-oriented development tasks."),
    ("Editor Tab autocomplete", "Editor capability", "Suggest code inline as the developer types."),
    ("Artifacts", "Agent capability", "Present plans, diffs, diagrams, images, and browser recordings as reviewable deliverables."),
    ("Parallel agents", "Agent capability", "Run separate asynchronous agent conversations across workspaces."),
])

add("GitHub Copilot", "Copilot CLI / IDE agent", "GH_CUSTOM", [
    ("execute (shell / Bash / powershell)", "Built-in tool alias", "Execute a command in the operating system shell."),
    ("read", "Built-in tool alias", "Read file contents."),
    ("edit", "Built-in tool alias", "Edit files, including text and notebook files."),
    ("search (Grep / Glob)", "Built-in tool alias", "Search for files or text inside files."),
    ("GitHub MCP tools", "MCP integration", "Call GitHub operations exposed by a configured GitHub MCP server."),
], "Copilot tool lists can include external MCP server tools; aliases and server tools are distinct.")
add("GitHub Copilot CLI", "CLI", "GH_SEARCH", [
    ("grep", "Built-in tool", "Search text in files."),
    ("glob", "Built-in tool", "Find files by path pattern."),
    ("bash", "Built-in tool", "Run shell commands."),
    ("edit", "Built-in tool", "Make file edits."),
    ("Tool search", "Built-in capability", "Discover external tools and load their definitions only when needed."),
    ("MCP server tools", "MCP integration", "Load and call tools exposed by configured MCP servers."),
])
add("GitHub Copilot CLI", "CLI", "GH_CLI", [
    ("/mcp", "Slash command", "List or manage configured MCP servers."),
    ("/worktree", "Slash command", "Create or manage a Git worktree for isolated work."),
    ("/review", "Slash command", "Review code changes."),
    (("/delegate"), "Slash command", "Delegate a task to a Copilot coding agent."),
])

add("Aider", "CLI chat", "AIDER_CMDS", [
    ("/add", "Slash command", "Add files to the active chat context so Aider can edit or inspect them."),
    ("/read-only", "Slash command", "Add reference files that Aider may read but should not edit."),
    ("/drop", "Slash command", "Remove files from the chat context to free context space."),
    ("/map", "Slash command", "Show the repository map used to give the model codebase structure."),
    ("/map-refresh", "Slash command", "Rebuild the repository map."),
    ("/run", "Slash command", "Run a shell command and optionally share its output with the model."),
    ("/test", "Slash command", "Run a test command and send failing output back into the chat."),
    ("/lint", "Slash command", "Lint files and use reported errors to guide fixes."),
    ("/diff", "Slash command", "Show code changes made since the last user message."),
    ("/undo", "Slash command", "Undo the last Aider Git commit."),
    ("/commit", "Slash command", "Commit the current dirty changes with a generated or supplied message."),
    ("/clear", "Slash command", "Clear chat history while keeping the current file context."),
    ("/reset", "Slash command", "Drop files and clear the chat context."),
    ("/tokens", "Slash command", "Report token use for the current chat context."),
])
add("Aider", "CLI chat", "AIDER_MODES", [
    ("code mode", "Mode", "Ask Aider to make requested changes to code."),
    ("ask mode", "Mode", "Discuss or understand the codebase without making edits."),
    ("architect mode", "Mode", "Have an architect model propose a change and an editor model turn it into file edits."),
    ("help mode", "Mode", "Ask questions about Aider usage and configuration."),
])
add("Aider", "CLI", "AIDER_TEST", [
    ("Automatic lint", "Automation", "Run configured or built-in linters on files Aider edits and use errors for repair."),
    (("--test-cmd"), "CLI option", "Set a test command Aider can run after changes."),
    (("--auto-test"), "CLI option", "Run the configured test command automatically after edits."),
    (("/run"), "Slash command", "Run code and optionally share its output with Aider."),
])
add("Aider", "CLI / Git", "AIDER_GIT", [
    ("Automatic Git commits", "Git integration", "Commit AI edits with descriptive messages so changes can be reviewed or undone."),
    ("/undo", "Slash command", "Undo the latest Aider-created Git commit."),
    ("/diff", "Slash command", "Inspect Aider's recent modifications."),
    ("/git", "Slash command", "Run a Git command from the chat."),
])

add("Gemini CLI", "CLI agent tools", "GEMINI_TOOLS", [
    ("run_shell_command", "Built-in tool", "Run a shell command, including interactive or background processes."),
    ("glob", "Built-in tool", "Find workspace files by glob pattern."),
    ("grep_search", "Built-in tool", "Search file contents with a regular expression."),
    ("list_directory", "Built-in tool", "List files and subdirectories."),
    ("read_file", "Built-in tool", "Read a file, including supported image, audio, and PDF files."),
    ("read_many_files", "Built-in tool", "Read and concatenate selected files or directory contents."),
    ("write_file", "Built-in tool", "Create or write file contents."),
    ("replace", "Built-in tool", "Replace specified text in a file."),
    ("ask_user", "Built-in tool", "Request user clarification through a dialog."),
    ("write_todos", "Built-in tool", "Maintain a list of task subtasks and their status."),
    ("activate_skill", "Built-in tool", "Load a named skill's instructions for the task."),
    ("get_internal_docs", "Built-in tool", "Retrieve Gemini CLI documentation by path."),
    ("enter_plan_mode / exit_plan_mode", "Built-in tools", "Enter planning mode and then leave it with a plan file."),
    ("google_web_search", "Built-in tool", "Search Google for current information."),
    ("web_fetch", "Built-in tool", "Fetch a URL and extract relevant content."),
], "Gemini CLI also supports MCP servers; MCP-provided tool names depend on each server.")

add("Cline", "CLI / IDE agent tools", "CLINE_TOOLS", [
    ("bash", "Built-in tool", "Execute shell commands."),
    ("editor", "Built-in tool", "View and edit project files."),
    ("read_files", "Built-in tool", "Read multiple files in one operation."),
    ("apply_patch", "Built-in tool", "Apply a unified diff to project files."),
    ("search", "Built-in tool", "Search the codebase using ripgrep-backed search."),
    ("fetch_web", "Built-in tool", "Fetch web pages and convert HTML to readable Markdown."),
    ("ask_question", "Built-in tool", "Ask the user for input."),
    ("MCP server tools", "MCP integration", "Call tools discovered from an MCP server configured for Cline."),
    ("Custom plugin tools", "Custom tool", "Call developer-defined tools registered through a Cline plugin."),
], "Built-ins listed here are the current ClineCore tools; MCP and plugin tools are additional and user-configured.")

add("OpenCode", "CLI / TUI agent tools", "OPENCODE_TOOLS", [
    ("read", "Built-in tool", "Read a file or list a directory."),
    ("glob", "Built-in tool", "Find files that match a glob pattern."),
    ("grep", "Built-in tool", "Search file contents using a regular expression."),
    ("edit", "Built-in tool", "Replace a unique string in an existing file."),
    ("write", "Built-in tool", "Create or completely replace a text file."),
    ("patch", "Built-in tool", "Apply a multi-file patch that can add, update, move, or delete files."),
    ("shell", "Built-in tool", "Run a command in the host shell, including background commands."),
    ("MCP server tools", "MCP integration", "Add callable tools whose names and inputs are supplied by connected MCP servers."),
], "OpenCode notes patch availability depends on the model; MCP tool definitions are server-provided.")

def build():
    with sqlite3.connect(DB_PATH) as con:
        con.executescript("""
        PRAGMA foreign_keys = ON;
        DROP TABLE IF EXISTS tools;
        DROP TABLE IF EXISTS sources;
        CREATE TABLE sources (
            source_id TEXT PRIMARY KEY,
            vendor TEXT NOT NULL,
            document_title TEXT NOT NULL,
            source_url TEXT NOT NULL UNIQUE,
            scope_note TEXT NOT NULL
        );
        CREATE TABLE tools (
            tool_id INTEGER PRIMARY KEY,
            product TEXT NOT NULL,
            product_surface TEXT NOT NULL,
            tool_name TEXT NOT NULL,
            tool_type TEXT NOT NULL,
            function_simple TEXT NOT NULL,
            mcp_relationship TEXT NOT NULL,
            source_id TEXT NOT NULL REFERENCES sources(source_id),
            verification_note TEXT NOT NULL,
            UNIQUE(product, product_surface, tool_name, source_id)
        );
        CREATE INDEX idx_tools_product ON tools(product);
        CREATE INDEX idx_tools_type ON tools(tool_type);
        CREATE INDEX idx_tools_mcp ON tools(mcp_relationship);
        """)
        con.executemany("INSERT INTO sources VALUES (?, ?, ?, ?, ?)", SOURCES)
        con.executemany("""INSERT INTO tools
            (product, product_surface, tool_name, tool_type, function_simple,
             mcp_relationship, source_id, verification_note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""", ROWS)
        con.commit()

    with sqlite3.connect(DB_PATH) as con:
        with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["tool_id", "product", "product_surface", "tool_name", "tool_type", "function_simple", "mcp_relationship", "source_id", "source_url", "verification_note"])
            writer.writerows(con.execute("""SELECT t.tool_id,t.product,t.product_surface,t.tool_name,t.tool_type,
                t.function_simple,t.mcp_relationship,t.source_id,s.source_url,t.verification_note
                FROM tools t JOIN sources s USING(source_id) ORDER BY t.product,t.product_surface,t.tool_id"""))
        with SOURCES_PATH.open("w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["source_id", "vendor", "document_title", "source_url", "scope_note"])
            writer.writerows(con.execute("SELECT * FROM sources ORDER BY vendor,source_id"))
        count = con.execute("SELECT count(*) FROM tools").fetchone()[0]
        products = con.execute("SELECT count(DISTINCT product) FROM tools").fetchone()[0]
        print(f"Built {DB_PATH.name}: {count} documented entries across {products} products and {len(SOURCES)} source documents")

if __name__ == "__main__":
    build()
