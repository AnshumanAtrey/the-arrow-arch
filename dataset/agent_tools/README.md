# Developer agent tool catalog

This is a source-linked catalog of documented tools and user-facing agent commands in developer CLIs and IDEs. It is separate from the X and Reddit problem datasets and does not modify their files.

The catalog prioritizes Codex, Claude Code, Cursor, and Google Antigravity, then includes Gemini CLI, GitHub Copilot, Cline, OpenCode, and Aider as adjacent developer-agent products. The records come from vendor-maintained documentation or the vendor's official source repository. They are factual descriptions of product capabilities, not generated feature proposals or user-reported problems.

## Files

- `agent_tools.sqlite`: SQLite database with normalized `tools` and `sources` tables and a foreign key from each tool record to its source.
- `tools.csv`: convenient flat export, with the source URL included on every row.
- `sources.csv`: de-duplicated source-document index.
- `build_database.py`: rebuilds the SQLite database and both CSV exports from the reviewed catalog entries in the script.

## Fields

- `tool_name`: Documented product tool, command, mode, or feature name. Slash commands and product-level capabilities are explicitly typed so they are not mistaken for callable agent tools.
- `function_simple`: A concise paraphrase of the vendor's documented function.
- `mcp_relationship`: Whether the row is native, an MCP integration, or a named MCP server. MCP is a protocol for connecting tool servers; most MCP tool names are supplied by the connected server, so they cannot be listed as fixed built-ins for a client.
- `source_id` / `source_url`: Vendor documentation supporting the row.
- `verification_note`: Scope and version caveats.

## Scope and limits

This is a curated first catalog, not an exhaustive inventory of every CLI, IDE, extension, model-specific capability, or third-party MCP server. Products update their tools frequently; the source URL is the authority for current availability. Some sources document an SDK/API surface rather than the desktop/CLI product, and the `product_surface` field keeps those separate. Antigravity's SDK tools, for example, are not assumed to be the exact same set available in every IDE or CLI version. MCP rows describe connection support or a named documented MCP server; they do not invent tool names for arbitrary servers.

Rows may represent a tool, slash command, CLI command, mode, or higher-level product feature. Check `tool_type` and `product_surface` before interpreting a row as an executable internal tool.

## Rebuild

From the project root, run:

```sh
python3 data/agent_tools/build_database.py
```

Example SQLite query:

```sql
SELECT product, tool_name, tool_type, function_simple, source_url
FROM tools JOIN sources USING (source_id)
WHERE product = 'Claude Code'
ORDER BY product_surface, tool_name;
```
