# Codex project guide

## Project

**ai video edeting machine** is a single-operator workspace for generating starting frames, reaction videos, and hooks, then assembling product videos in batches. Preserve the product name's existing spelling unless asked to rename it.

- Repository: https://github.com/dulyan/ai-video-edeting-machine
- Frontend: https://dulyan.github.io/ai-video-edeting-machine/
- Production API base URL: https://46.62.236.47 (without `/api` in the Settings input)
- Stack: React 19, Vite, TypeScript, Fastify, Node.js 24+, SQLite, private disk/S3-compatible storage, and FFmpeg.
- AI provider: **Siray**, `api.siray.ai`. Do not confuse it with similarly named services.

Read the relevant implementation before changing behavior. Some older README paragraphs describe superseded workflows; current code, tests, and the rules below describe the intended behavior. This file is project documentation; it does not install or activate tools.

## Workflow and invariants

The main workflow has nine steps: Project name, Starting frames, Reaction videos, Viral hooks, Choose clips, Product demos, Music, Task outline, and Project status. Every step can be skipped without deleting its saved inputs.

### Starting frames

- Keep separate **Text-model instructions** and **Fixed image instructions** fields, a text-model selector, a text-to-image selector, output count, aspect ratio, and Variation setting.
- The text model invents detailed, specific descriptions consistent with the fixed instructions. Variation controls breadth of invention, not descriptive detail.
- Supply fixed instructions to the text model as read-only context; never ask it to rewrite or reproduce them.
- Assemble the provider prompt deterministically: `fixedInstructions + "\n\n" + generatedDescription`. If the fixed field is empty, use the description alone. Preserve the fixed field's exact wording, whitespace, and line breaks.
- Stream live descriptions and progress. All requested descriptions must finish before image jobs are submitted. Keep completed descriptions on failure and resume from checkpoints.
- Save the exact assembled prompt and its source sections with each generated asset. The preview/copy action must match the actual provider prompt.
- Presets save and restore both fields and Variation together.
- New batches use `split-image-v2`. Reference-pose inputs have been removed; do not restore them or send stale reference lists from older projects.
- Current default image instructions require a closed mouth, touching lips, and a gentle smile with a happy, pleasantly surprised, excited expression. These are editable prompt defaults, not hidden backend additions to every custom image prompt.

### Reaction videos

- Operators select all or specific starting frames from the library and choose the number of videos **per starting frame**.
- Keep separate text-model and fixed-video instruction fields, a text-model selector, a compatible image-to-video selector, aspect ratio, and duration.
- New batches use `split-video-v2`. Generate one fresh description per output, then randomly assign descriptions to a balanced set of source-frame slots. Every selected frame gets the requested number of videos.
- Persist assignments before creating child jobs so retries do not reshuffle or duplicate work. Finish all descriptions before submitting media jobs.
- Preserve fixed instructions verbatim and assemble prompts using the same two-newline rule as starting frames.
- Actions should convey excitement and surprise through a plausible free-hand gesture. Optional spoken reactions are Russian only, with **one to three words total**; expressive reactions without speech are also allowed.
- Generated descriptions end with exactly one declaration: `Speech: «Russian phrase»` or `Speech: none.` Validate this before submission.
- Enable native generated audio where supported. Do not inject silence, frozen-mouth guidance, negative prompts, CFG overrides, or matching end frames into new reaction jobs.
- Final reaction clips are at most five seconds. Models with a longer native minimum remain selectable: request a supported duration, explain the billed duration, and trim the saved clip to the selected cap while preserving audio.
- Legacy silence/freeze-lips/reference helpers exist to resume old immutable snapshots. Their presence does not mean those controls belong in the current workflow.

### Hooks and final composition

- Reusable products retain facts for later hook generation. Hook-writing models are selected on the hook step. Text, Snapchat, IMG, Text Wall, and Green screen styles have previews and relevant settings.
- Final combinations are **hook x reaction clip x product demo x music track**. A skipped dimension contributes one empty component. Reaction footage precedes the product demo.
- Music modes distinguish every selected track, one random selected track per visual combination, and no added music. Do not accidentally multiply outputs in random mode.
- Hook and music spans are independent: whole video, reaction only, or demo only. Preserve global settings and per-output overrides in the editable outline.
- Siray generates AI media; **local FFmpeg performs final composition**. Do not replace real rendering with a simulated completion state.
- Keep saved assets associated with their projects and corresponding libraries. Show actual job state and completed outputs as they become available.

## Code map

| Location | Responsibility |
| --- | --- |
| `src/Workflow.tsx` | Workflow forms, generation controls, selections, and outline |
| `src/workspace.tsx`, `src/api.ts` | Workspace state, API calls, authentication, event-stream reconnection |
| `src/workspace-sync.ts` | Versioned reconciliation, per-field draft overlays, offline project/product/preset outbox |
| `src/GenerationProgress.tsx`, `src/PromptContent.tsx` | Live progress and exact prompt inspection |
| `src/ModelPicker.tsx`, `src/RatioPicker.tsx`, `src/style.css` | Model/ratio controls and shared visual styling |
| `shared/types.ts`, `shared/schema.ts`, `shared/project.ts` | Shared types, validation, defaults, combinations, and project behavior |
| `shared/models.ts`, `shared/catalog.ts`, `shared/catalog-snapshot.json` | Model capabilities and bundled catalog |
| `shared/image-prompts.ts`, `shared/reaction-plan.ts`, `shared/reaction.ts` | Prompt assembly, reaction validation/assignment/duration, and audio inputs |
| `server/index.ts` | API routes and immutable job-input creation |
| `server/prepare.ts`, `server/prompt-stream.ts`, `server/prompt-parser.ts` | Parallel text preparation, streaming, parsing, and resumable checkpoints |
| `server/text-slots.ts` | Shared text-request concurrency limit |
| `server/siray.ts`, `server/catalog.ts` | Siray REST payloads and catalog refresh |
| `server/queue.ts`, `server/store.ts`, `server/storage.ts` | Durable jobs, SQLite, asset metadata, and private media |
| `server/render.ts`, `server/conform.ts`, `server/reaction-duration.ts` | FFmpeg composition, ratios, and reaction duration enforcement |
| `server/previews.ts` | Cached still thumbnails and bounded H.264/AAC browser playback copies |
| `server/sessions.ts`, `server/events.ts` | Durable hashed sessions and authenticated SSE |
| `tests/*.test.ts` | Workflow, payload, retry, authentication, and real FFmpeg checks |
| `.github/workflows/pages.yml`, `deploy/compose.yml`, `Dockerfile` | Frontend CI/deploy and backend container configuration |

## Local commands

Use Node.js 24 or later. In Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

```powershell
npm.cmd ci --ignore-scripts
npm.cmd rebuild esbuild ffmpeg-static
Copy-Item .env.example .env
# Configure .env locally; never commit credentials.
npm.cmd run server
# In another terminal:
npm.cmd run dev
```

Do not overwrite an existing `.env`. The API normally uses port 3001 and Vite port 5173. Settings connects the browser to the backend using the workspace password; the Siray key is a separate backend setting.

Verification commands:

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build
```

Run checks appropriate to the change. Tests use mocked AI transport and temporary storage; they must not spend provider credits. FFmpeg tests verify real media behavior. For UI changes, check desktop and mobile readability, overflow, and live progress. Prefer relevant tests over assertions that merely repeat implementation details.

## Reliability, security, and provider integration

- Keep one backend instance with SQLite on persistent storage. Preserve immutable job snapshots and backward compatibility for old projects, presets, jobs, and assets.
- Order server snapshots and mutation acknowledgements using the durable SQLite revision. Preserve unacknowledged field edits across older SSE/GET responses, failed saves, reloads, and reconnects. Do not replace an entire locally edited project just because a save request completed.
- Persist browser drafts only when editable records change, with a pagehide flush. Always flush pending project writes before submitting generation or rendering.
- Library cards use still thumbnails rather than video decoders; paginate large libraries. Music and hook previews load video/audio only after an explicit Play click. Playback copies are at most 480 pixels and 24 fps, limited to the first two minutes, without altering original assets or render quality. Chroma-key canvas work is bounded to 320 pixels and 15 fps and stops when paused, hidden, or unmounted.
- Text preparation has a shared maximum of four concurrent requests. Retain partial checkpoints, uniqueness checks, cancellation, and live SSE updates.
- Preserve provider task IDs. An ambiguous submission must remain uncertain rather than being automatically resubmitted and billed twice. Canceling local tracking does not guarantee provider cancellation.
- Filter model pickers by action capabilities. Do not hide otherwise compatible models unnecessarily. Use published schemas for native inputs; do not invent unsupported fields or silently substitute the selected model.
- The Siray integration uses REST payload assembly, not a `client.run()` SDK call. Inspect `server/siray.ts` when tracing the exact outgoing request.
- Catalog data refreshes from public Model Verse and authenticated model availability; do not assume the bundled model count is permanently current.
- Workspace sessions last seven days and persist across backend restarts. Store token hashes only. Password/encryption-key changes invalidate sessions; logout revokes them.
- Keep media private and API keys encrypted on the backend. Never put credentials in frontend variables, logs, source control, or this document.
- Avoid changing `ENCRYPTION_KEY` during deployments: existing settings and media access depend on it.
- Preserve UTF-8, especially Russian prompt examples. On Windows, avoid PowerShell text pipelines that can corrupt Unicode; use explicit UTF-8 file operations or patches.

## Production operations

- GitHub Pages deploys the frontend from `main` after tests and build. `VITE_API_URL` is a public backend URL, never an API key. Frontend deployment does not deploy the backend.
- Backend: Ubuntu 24.04 LTS on Hetzner, Docker Compose behind Nginx HTTPS.
- Server checkout: `/srv/ai-video-edeting-machine/source`.
- Persistent data: `/srv/ai-video-edeting-machine/data`, owned by UID/GID 1000 with mode 700.
- Private environment: `/etc/ai-video-edeting-machine/app.env`, root-readable only.
- Compose binds the API to host loopback `127.0.0.1:3001`. Keep HTTPS, CORS, authenticated SSE, proxy timeouts, and disabled SSE buffering working.
- Preserve the Dockerfile's readable application permissions for the non-root container user.
- Before backend/data migrations, make a verified SQLite backup and preserve existing media, environment, and encryption key. Check for active jobs before maintenance that could interrupt generation.
- Existing maintenance scripts and private backups are in sibling workspace directories `../server-maintenance/` and `../server-backups/`, outside the public repository. Inspect scripts before use; never commit their private contents.
- Keep verified backups of the retired Viral Engine. Do not delete them as cleanup.
- After deployment, verify `/api/health`, authenticated state access, event streaming, and the published UI. Do not trigger paid generations simply to smoke-test a deployment.

## Cloned external repositories

These are independent local Git repositories under `tools/`, not installed application dependencies or activated Codex skills:

| Directory | Upstream |
| --- | --- |
| `tools/cavemen` | https://github.com/JuliusBrussee/caveman.git |
| `tools/headroom` | https://github.com/headroomlabs-ai/headroom.git |
| `tools/graphify` | https://github.com/Graphify-Labs/graphify.git |
| `tools/codeburn` | https://github.com/getagentseal/codeburn.git |
| `tools/ponytail` | https://github.com/DietrichGebert/ponytail.git |

Headroom, Graphify, and Codeburn were fetched with shallow history. Read each tool's documentation, license, and installation requirements before integrating it. Keep tool setup separate from application runtime changes. Do not accidentally stage nested repositories, execute their setup scripts, or add their dependencies to this app merely because they were cloned.

## UI direction

Keep the interface focused on the operator's workflow: clear labels, prominent readable text at 100% browser zoom, useful controls, and visible generation status. Support light/dark themes and mobile layouts. Avoid decorative metrics, redundant controls, hidden prompt modifications, and implementation details that do not help operators make a decision.
