# Zo Computer — Full Tool Definitions (Verbatim)

> Source: Zo Computer chat session (MiniMax 2.5 model), March 2026.
> User asked: "output all the exact tool definitions, with the full schema, as is"
> This is the verbatim response from the agent.

---

## Available Models (from `create_agent` tool)

- `zo:fast`, `zo:smart`
- `openai:gpt-5.3-codex`, `openai:gpt-5.4-2026-03-05`
- `anthropic:claude-opus-4-6`, `anthropic:claude-sonnet-4-5-20250929`
- `vercel:moonshotai/kimi-k2.5`, `vercel:zai/glm-5`, `vercel:minimax/minimax-m2.5`
- `vercel:google/gemini-3.1-pro-preview`

**Note:** MiniMax 2.5 and Kimi 2.5 are offered for free.

---

## File & Text Tools

### `read_file`
Read a file from the computer. Zo Computer supports a wide range of file formats including text, word processing, spreadsheets, PDFs, ebooks, images, audio, and video.

**Args:**
- `target_file` (string, required): Absolute path of the file to read.
- `text_start_line_1_indexed` (number, optional): 1-indexed line number to start reading from.
- `text_end_line_1_indexed_inclusive` (number, optional): 1-indexed line number to end reading at (inclusive).
- `text_read_entire_file` (boolean, optional): If true, attempt to read entire text file.
- `pdf_epub_start_page_1_indexed` (number, optional): 1-indexed start page for PDF/EPUB.
- `pdf_epub_end_page_1_indexed_inclusive` (number, optional): 1-indexed end page for PDF/EPUB.
- `pdf_epub_include_images` (boolean, optional): Include rendered page images.

### `edit_file`
Edit a text file using a sequence of precise edit operations.

**Args:**
- `target_file` (string, required): Absolute path to the file to edit.
- `operations` (array, required): List of operations — `replace_block`, `insert_after`, `insert_before`, `delete_block`, `append_line`.

### `edit_file_llm`
Edit a text file using a fast apply LLM.

**Args:**
- `target_file` (string, required): Absolute path of the file to edit.
- `instructions` (string, required): A single sentence describing what you're changing.
- `code_edit` (string, required): Only the precise lines to edit. Use `// ... existing code ...` for unchanged sections.

### `create_or_rewrite_file`
Create a new file or rewrite an existing one with the provided content.

**Args:**
- `target_file` (string, required): Absolute path of the file to create or rewrite.
- `content` (string, optional): Content to write to the file. Defaults to empty.

### `grep_search`
Search files by content or filename using ripgrep.

**Args:**
- `query` (string, required): Pattern or fragment to search.
- `location` (string, optional): `USER` | `CONVERSATION` | `ALL_CONVERSATIONS`. Default: `USER`.
- `case_sensitive` (boolean, optional): true=case-sensitive, false=case-insensitive, null=smart-case.
- `exclude_pattern` (string, optional): Glob pattern to exclude.
- `include_pattern` (string, optional): Glob pattern to include.
- `search_kind` (string, required): `content` or `filename`.

### `list_files`
Directory listing tool that shows files and subdirectories in a tree structure.

**Args:**
- `path` (string, required): Absolute path to the directory to list.
- `ignore` (array, optional): List of glob patterns to ignore.

---

## Shell & Code Tools

### `run_bash_command`
Run a single shell command on the computer.

**Args:**
- `cmd` (string, required): Shell command string to execute.
- `cwd` (string, optional): Working directory. Defaults to `/home/workspace`.

### `run_sequential_cmds`
Run multiple shell commands sequentially.

**Args:**
- `cmd_list` (array, required): List of shell command strings to execute in order.
- `cwd` (string, optional): Working directory.

### `run_parallel_cmds`
Run multiple shell commands in parallel.

**Args:**
- `cmd_list` (array, required): List of shell command strings to execute concurrently.
- `cwd` (string, optional): Working directory.

---

## Web Browser Tools

### `open_webpage`
Open a webpage in Zo's browser. Session persists across conversation turns (~5 min idle timeout).

**Args:**
- `url` (string, required): URL of the webpage to open.

### `view_webpage`
View the current page and get content plus a screenshot.

**Args:** (none)

### `use_webpage`
Interact with the current page using an AI agent.

**Args:**
- `task` (string, required): Specific task with explicit stop condition.
- `output_schema` (object, optional): JSON schema for structured output.

### `read_webpage`
Read the content of a webpage. Saves as Markdown to conversation workspace.

**Args:**
- `url` (string, required): URL of the webpage to visit.
- `use_browser` (boolean, optional): Use Zo's browser (slower, for dynamic/authenticated pages).

### `save_webpage`
Save webpage content to the user's Articles directory.

**Args:**
- `url` (string, required): URL of the webpage to save.

---

## Web Search Tools

### `web_search`
Search the web using a search engine.

**Args:**
- `query` (string, required): Search query.
- `time_range` (string, required): `anytime` | `day` | `week` | `month` | `year`.
- `include_domains` (array, optional): Domains to constrain results.
- `topic` (string, optional): `general` or `news`.

### `web_research`
Perform an in-depth web search.

**Args:**
- `query` (string, required): Search query.
- `category` (string, optional): `company` | `research paper` | `pdf` | `github` | `tweet` | `personal site` | `linkedin profile` | `financial report` | `people`.
- `include_domains` (array, optional): Domains to include.
- `exclude_domains` (array, optional): Domains to exclude.
- `include_text` (array, optional): Strings that must appear in page text.

### `find_similar_links`
Find web pages similar to a given URL.

**Args:**
- `url` (string, required): URL to find similar pages for.
- `include_domains` (array, optional): Only return results from these domains.
- `exclude_domains` (array, optional): Exclude results from these domains.
- `exclude_source_domain` (boolean, optional): Exclude results from same domain. Default: true.

### `maps_search`
Search Google Maps for locations.

**Args:**
- `query` (string, required): Natural language prompt describing what to find.
- `location` (string, optional): Location or area to bias results.
- `open_now` (boolean, optional): Filter for places open now.
- `min_rating` (number, optional): Minimum rating (0–5).
- `included_type` (string, optional): Place type (e.g., restaurant, cafe, museum).
- `price_level` (string, optional): `$`, `$$`, `$$$`, `$$$$`.
- `language` (string, optional): BCP-47 language tag.
- `region` (string, optional): Region code (e.g., us, gb, fr).

### `x_search`
Search X (Twitter) for posts and users.

**Args:**
- `query` (string, required): Natural language prompt describing what to find.
- `allowed_x_handles` (array, optional): Only include posts from these handles (max 10).
- `excluded_x_handles` (array, optional): Exclude posts from these handles (max 10).
- `from_date` (string, optional): Start date (YYYY-MM-DD).
- `to_date` (string, optional): End date (YYYY-MM-DD).
- `enable_image_understanding` (boolean, optional): Enable image analysis. Default: true.
- `enable_video_understanding` (boolean, optional): Enable video analysis. Default: true.

---

## Media Tools

### `generate_image`
Generate an image using AI (Google Gemini 3 Pro Image).

**Args:**
- `prompt` (string, required): Description of the desired image.
- `file_stem` (string, required): Base name for output files.
- `n` (number, optional): Number of images (1-10). Default: 1.
- `output_dir` (string, optional): Directory for output. Default: `/home/workspace/Images`.
- `aspect_ratio` (string, optional): `21:9`, `16:9`, `4:3`, `3:2`, `1:1`, `9:16`, `3:4`, `2:3`, `5:4`, `4:5`.

### `edit_image`
Remix an existing image using AI (Google Gemini 3 Pro Image).

**Args:**
- `prompt` (string, required): Description of desired modifications.
- `filepaths` (array, required): 1-3 absolute paths to images to edit/combine.
- `file_suffix` (string, optional): Suffix for output file. Default: `_edited`.

### `generate_video`
Generate a 5-second video from an input image (OVI).

**Args:**
- `instruction` (string, required): Description of desired motion, scene evolution, and audio.
- `filepath` (string, required): Absolute path to source image.
- `file_suffix` (string, optional): Suffix for output. Default: `_video`.
- `orientation` (string, optional): `landscape` (16:9) or `portrait` (9:16). Default: `landscape`.

### `generate_d2_diagram`
Generate a block diagram using D2 language.

**Args:**
- `code` (string, required): Valid D2 source (plain text).
- `file_stem` (string, required): Base filename for .d2 and .png.
- `output_dir` (string, optional): Directory for PNG. Default: `/home/workspace/Images`.

### `image_search`
Search for images on the web.

**Args:**
- `query` (string, required): Search query for finding images.

### `transcribe_audio`
Transcribe an audio file (AssemblyAI).

**Args:**
- `audio_file_path` (string, required): Absolute path to the audio file.

### `transcribe_video`
Transcribe audio from a video file (AssemblyAI).

**Args:**
- `video_file_path` (string, required): Absolute path to the video file.

---

## Zo Space Tools

### `update_space_route`
Create or update a route in the user's zo.space site.

**Args:**
- `path` (string, required): Route path starting with `/`. Use `/` for custom home page.
- `route_type` (string, required): `api` or `page`.
- `code` (string, optional): Full replacement source code. Use for new routes or total rewrites.
- `code_edit` (string, optional): Partial edit — only changed sections with `// ... existing code ...` placeholders.
- `edit_instructions` (string, optional): Sentence describing the edit.
- `public` (boolean, optional): Whether route is publicly accessible. API routes always public.

### `delete_space_route`
Delete a route from the user's zo.space site.

**Args:**
- `path` (string, required): Route path to delete.

### `list_space_routes`
List all routes in the user's zo.space site.

**Args:** (none)

### `get_space_route`
Get a space route by path, including source code.

**Args:**
- `path` (string, required): Route path.

### `undo_space_route`
Undo the last change to a space route.

**Args:**
- `path` (string, required): Route path to undo.

### `redo_space_route`
Redo a previously undone space route change.

**Args:**
- `path` (string, required): Route path to redo.

### `update_space_asset`
Copy a file from workspace to zo.space assets.

**Args:**
- `source_file` (string, required): Path to source file in workspace.
- `asset_path` (string, required): URL path where asset will be served (starting with `/`).

### `delete_space_asset`
Delete a static asset from zo.space.

**Args:**
- `asset_path` (string, required): URL path of the asset to delete.

### `list_space_assets`
List all uploaded assets in zo.space.

**Args:** (none)

### `get_space_errors`
Get recent errors from zo.space routes.

**Args:** (none)

---

## Service Management Tools

### `register_user_service`
Register a User Service (HTTP or TCP) on your Zo server.

**Args:**
- `label` (string, required): Unique label (lowercase, hyphens).
- `protocol` (string, required): `http` or `tcp`.
- `local_port` (number, required): Localhost port to expose (1024-65535).
- `entrypoint` (string, optional): Command to run the service.
- `workdir` (string, optional): Working directory. Default: `/home/workspace`.
- `env_vars` (object, optional): Environment variables (PORT overridden).

### `update_user_service`
Update a user service. Always restarts the service.

**Args:**
- `service_id` (string, required): Identifier of the service to update.
- `label` (string, optional): Unique label.
- `local_port` (number, optional): Localhost port.
- `entrypoint` (string, optional): Command to run.
- `workdir` (string, optional): Working directory.
- `env_vars` (object, optional): Environment variables.

### `delete_user_service`
Delete a user service.

**Args:**
- `service_id` (string, required): Identifier of the service to delete.

### `list_user_services`
List User Services running on your Zo server.

**Args:** (none)

### `service_doctor`
Diagnose issues with a user service.

**Args:**
- `service` (string, required): Service label or service_id to inspect.

### `proxy_local_service`
Proxy a local service to a public endpoint (temporary tunnel).

**Args:**
- `local_port` (number, required): Local port to proxy (1024-65535).

---

## Agent Tools

### `create_agent`
Create an agent to automatically run an AI task on a schedule.

**Args:**
- `rrule` (string, required): RFC 5545 RRULE string (bare RRULE without DTSTART).
- `instruction` (string, required): Clear, actionable instruction to execute.
- `delivery_method` (string, optional): `email` | `sms` | `telegram` | `null`.
- `model` (string, optional): Model ID (e.g., `vercel:minimax/minimax-m2.5`).

### `edit_agent`
Edit an existing agent's instruction, schedule, delivery method, or model.

**Args:**
- `agent_id` (string, required): Unique identifier of the agent to modify.
- `instruction` (string, optional): New instruction text.
- `rrule` (string, optional): New RFC 5545 RRULE string.
- `delivery_method` (string, optional): `email` | `sms` | `telegram` | `none`.
- `model` (string, optional): Model ID.
- `active` (boolean, optional): true to resume, false to pause.

### `delete_agent`
Delete an existing agent.

**Args:**
- `agent_id` (string, required): Unique identifier of the agent to delete.

### `list_agents`
List all registered agents.

**Args:** (none)

---

## Persona Tools

### `create_persona`
Create a new persona for Zo.

**Args:**
- `name` (string, required): Persona display name.
- `prompt` (string, required): System prompt text for the persona.
- `image` (string, optional): Image URL for avatar.

### `edit_persona`
Edit fields of an existing persona.

**Args:**
- `persona_id` (string, required): Identifier of the persona to update.
- `name` (string, optional): New display name.
- `prompt` (string, optional): Full replacement system prompt.
- `prompt_edit` (string, optional): Partial edit of prompt.
- `edit_instructions` (string, optional): Sentence describing the edit.
- `image` (string, optional): New image URL for avatar.

### `delete_persona`
Delete a persona by ID.

**Args:**
- `persona_id` (string, required): Identifier of the persona to delete.

### `list_personas`
List all personas for the user.

**Args:** (none)

### `set_active_persona`
Set the active persona for the current channel.

**Args:**
- `persona_id` (string, required): Identifier of the persona to set active.

---

## Rule Tools

### `create_rule`
Create a new user rule for Zo.

**Args:**
- `instruction` (string, required): Instructions for Zo to follow.
- `condition` (string, optional): Condition for when to apply the rule.

### `edit_rule`
Edit an existing rule.

**Args:**
- `rule_id` (string, required): Identifier of the rule to update.
- `instruction` (string, optional): New instruction text.
- `condition` (string, optional): New condition expression.

### `delete_rule`
Delete a rule by ID.

**Args:**
- `rule_id` (string, required): Identifier of the rule to delete.

### `list_rules`
List all rules for the user.

**Args:** (none)

---

## App Integration Tools

### `list_app_tools`
List all available tools for a connected app.

**Args:**
- `app_slug` (string, required): App slug (e.g., `gmail`, `notion`, `linear`).

> Note: Each connected app exposes `use_app_*` tools dynamically. The exact tools depend on the app (e.g., Gmail exposes send, search, read; Notion exposes search, read, create page; etc.)

---

## Other Tools

### `send_email_to_user`
Send an email to the user's email address.

**Args:**
- `subject` (string, required): Email subject line.
- `markdown_body` (string, required): Email body in markdown format.

### `connect_telegram`
Connect Telegram to Zo.

**Args:** (not documented in dump)

### `update_user_settings`
Update user settings.

**Args:** (not documented in dump)

### `change_hardware`
Change the hardware/compute tier.

**Args:** (not documented in dump)

### `tool_docs`
Get documentation for a specific tool.

**Args:** (not documented in dump)

---

## Tool Count Summary

| Category | Count | Tools |
|---|---|---|
| File & Text | 6 | read_file, edit_file, edit_file_llm, create_or_rewrite_file, grep_search, list_files |
| Shell & Code | 3 | run_bash_command, run_sequential_cmds, run_parallel_cmds |
| Web Browser | 5 | open_webpage, view_webpage, use_webpage, read_webpage, save_webpage |
| Web Search | 6 | web_search, web_research, find_similar_links, maps_search, x_search, image_search |
| Media | 6 | generate_image, edit_image, generate_video, generate_d2_diagram, transcribe_audio, transcribe_video |
| Zo Space | 10 | update/delete/list/get_space_route, undo/redo_space_route, update/delete/list_space_assets, get_space_errors |
| Services | 6 | register/update/delete/list_user_services, service_doctor, proxy_local_service |
| Agents | 4 | create/edit/delete/list_agents |
| Personas | 5 | create/edit/delete/list_personas, set_active_persona |
| Rules | 4 | create/edit/delete/list_rules |
| Apps | 1+ | list_app_tools + dynamic use_app_* per connected service |
| Other | 5 | send_email_to_user, connect_telegram, update_user_settings, change_hardware, tool_docs |
| **Total** | **~61** | |
