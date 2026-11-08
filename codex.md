# Codex project guide

## Project

**ai video edeting machine** is a single-operator workspace for generating starting frames, reaction videos, and hooks, then assembling product videos in batches. Preserve the product name's existing spelling unless asked to rename it.

- Repository: https://github.com/dulyan/ai-video-edeting-machine
- Current browser app and API: http://127.0.0.1:3001, served by one Node backend on this PC.
- Previous frontend: https://dulyan.github.io/ai-video-edeting-machine/; previous API: https://46.62.236.47. Local operation does not use them.
- Stack: React 19, Vite, TypeScript, Fastify, Node.js 24+, SQLite, private disk/S3-compatible storage, and FFmpeg.
- AI provider: **Siray**, `api.siray.ai`. Do not confuse it with similarly named services.

Read the relevant implementation before changing behavior. Some older README paragraphs describe superseded workflows; current code, tests, and the rules below describe the intended behavior. This file is project documentation; it does not install or activate tools.

## Workflow and invariants

The main workflow has nine steps: Project name, Starting frames, Reaction videos, Viral hooks, Choose clips, Product demos, Music, Task outline, and Project status. Every step can be skipped without deleting its saved inputs.

### Starting frames

- Show **Fixed image instructions** first and **Random elements instructions** second, both plain text. Keep text/image model selectors, output count, and aspect ratio. Starting frames and Task outline have no Variation control.
- New batches always request maximum diversity within the written constraints. The text model reads the fixed foundation followed by the random-elements brief, then returns only specific, detailed scene descriptions. Do not add hidden persona or setting restrictions.
- Supply fixed instructions to the text model as read-only context; never ask it to rewrite or reproduce them.
- Assemble the provider prompt deterministically: `fixedInstructions + "\n\n" + generatedDescription`. If the fixed field is empty, use the description alone. Preserve the fixed field's exact wording, whitespace, and line breaks.
- Stream live descriptions and progress. All requested descriptions must finish before image jobs are submitted. Keep completed descriptions on failure and resume from checkpoints.
- Save the exact assembled prompt and its source sections with each generated asset. The preview/copy action must match the actual provider prompt.
- Presets save and restore both fields together. Retain the legacy `imagePrompt` storage field for random-elements instructions; legacy variation values remain readable but do not reduce diversity for new batches.
- New batches use `split-image-v3`; old v1/v2 batches retain their original prompt instructions and variation when resumed. Reference-pose inputs have been removed; do not restore them or send stale reference lists from older projects.
- Built-in defaults are in `shared/starting-frame-defaults.ts`. The fixed block holds UGC style/camera/avatar/background/consistency/expression/negative requirements. The random-elements default automatically chooses adult age, gender, ethnicity, background, and other concrete details. Existing custom projects and presets are not overwritten; load UGC portrait to apply revised defaults.
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
| `server/local-app.ts`, `server/local-logging.ts` | Local static interface, loopback/origin guards, private shutdown, rotating logs |
| `scripts/local.mjs`, `scripts/local-runtime.mjs`, `scripts/local-backup.mjs` | Desktop lifecycle, private profile setup, and consistent local backups |
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
- Library cards use still thumbnails rather than video decoders; paginate large libraries. Music/hook previews and the asset inspector play original media, without lower-resolution, recompressed, or duration-limited playback copies. Load playback media only after Play (inspector uses preload=none). The derivative-preview API remains for backward compatibility, not normal UI playback. Chroma-key canvas work is an approximate compositor bounded to 320 pixels and 15 fps and stops when paused, hidden, or unmounted.
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

- Current runtime is the local browser app. Start/Stop desktop shortcuts launch a hidden backend and open the default browser; there is no automatic Windows startup. Closing the browser leaves background jobs running while the PC remains awake.
- Private data/configuration live under `%LOCALAPPDATA%\AI Video Edeting Machine`, outside the checkout, restricted to the user and SYSTEM. Preserve `config.env` and its encryption key with database/media backups. Never print those credentials.
- The user explicitly chose a fresh workspace without importing VPS projects/media for now. Leave the VPS and verified backups untouched. A later recovery must preserve newer local work instead of overwriting it.
- Local mode binds exclusively to 127.0.0.1, serves built UI assets publicly, protects API/media routes, validates Host/Origin, and resolves the frontend API against its own origin. Do not inherit a Pages/VPS build address or saved remote backend setting for a built local interface.
- Local setup/start/stop/backup commands are in README. `QUEUE_ENABLED=0` disables queue recovery/execution for validation. Retain CPU encoding and existing bounded workers/previews.
- Bulk music uploads support MP3/WAV/M4A and run sequentially with progress/cancel and incremental selection. Preserve partial successes; stop a batch on connection/auth/storage failures. Probe time and metadata output are bounded; original audio is never decoded automatically during upload.
- Historical hosted deployment details below apply only when explicitly maintaining or restoring that deployment.
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

## Hook fonts and virality

Viral hooks supports a project default font plus an optional override on each text hook. Use the default-for-all action to clear overrides. Font choices are Montserrat, Poppins, Anton, Bebas Neue, Oswald, Inter, Roboto, Open Sans, Playfair Display, and Caveat. Bundled Google Fonts TTFs and OFL licenses live in public/fonts; browser and FFmpeg select the same family. For Cyrillic, Poppins falls back to Montserrat, and Anton/Bebas Neue to Oswald. Old queued render snapshots retain their legacy font.

Virality 1 means neutral product facts; 10 means industry-first curiosity with a relevant unanswered question. Intermediate values progressively broaden the framing. This is a writing direction, not a prediction of views. Product descriptions, pain points, cost of inaction, solution, and proof ground all levels. Do not invent claims or promises. New hook jobs snapshot the chosen level and product context for retries; existing jobs retain their previous policy.

The ten-font list is curated, not a verified CapCut trend ranking. CapCut does not provide a public ranked usage leaderboard in the sources reviewed. Sources include https://www.capcut.com/resource/anton-font , https://www.capcut.com/resource/subtitle-font , https://www.capcut.com/resource/poppins-font and https://www.capcut.com/resource/youtube-thumbnail-font . Inter and Caveat round out the shortlist as caption/design choices, without a claim of universal built-in availability. Font provenance and checksums: public/fonts/manifest.json. Refresh the vendored assets with node scripts/fetch-hook-fonts.mjs only when deliberately updating them.

Hook layout and audio: five positions (Top, Upper middle, Middle, Lower middle, Bottom) are shared by browser and renderer. Hook.enabled defaults to true when absent; unchecked hooks remain saved but are omitted from active combinations. The hook editor may preview unchecked hooks. Font size is expressed in pixels on a 1080px-wide canvas and scales with preview/output width. New render snapshots use textLayoutVersion 2 and compensate libass REAL_DIM sizing with each bundled font's OS/2 Win metrics; existing render snapshots retain their original typography. Reaction/demo volumes can be set or muted independently in Task outline. Missing segment volumes inherit legacy sourceVolume; the Music step's Original audio slider sets both together. Segment gain is applied once before concatenation, leaving music independent.

Music starting points: each project can save musicStartOffsets (seconds keyed by track ID). Missing offsets are zero. The Music step exposes one input per track without mounting or decoding audio automatically. Deselecting a track preserves its offset. Selected and random modes snapshot the chosen track's offset into every render job; retries and existing queued jobs retain their saved value (legacy jobs start at zero). FFmpeg seeks the music source before trimming/delaying it to the selected whole/reaction/demo span. The live preview seeks the first selected music track to its configured offset when loaded.

## VidGen

Left navigation now groups the nine workflow steps under Studio; step navigation is inside Studio. VidGen is a separate single-screen video tool using every video model in the current Siray catalog. The checked-in fallback catalog was refreshed on November 2, 2026 (86 video models); Refresh models reloads live availability and schemas.

VidGen renders all published parameters without the Studio field exclusions, including nested objects, ordered reference arrays, booleans, seeds, native durations, output counts, sizes and aspect ratios. Optional unset fields use provider defaults. Media can be uploaded or chosen from libraries; drafts are saved per model and project. Models without a published schema have a JSON settings editor.

POST /api/vidgen requires the existing workspace authentication and accepts projectId, modelId, inputs, and a UUID requestId. Server validation uses the selected available model schema; repeated request IDs return the original job. Job snapshots store tool=vidgen, the operator payload, and the model definition. Do not run these requests through Studio's payload builder, prompt generation, five-second reaction cap, silent-audio controls, or ratio conversion. Resolve media asset references recursively according to their field schema, while keeping prompt text literal. Every provider output is saved in its original form to the project video library; partial downloads resume with the saved provider task ID without re-submitting. The VidGen screen shows job status, cancellation, retry, request snapshots, inspection, and original download.

Workspace job data: internal Job.input is deliberately omitted from /api/state and live events. Browser components use PublicJob. VidGen identifies public jobs with job.tool and reads their saved request from job.requestSettings; never read worker input in client code.

Apple hook emoji: hooks containing emoji use the same transparent PNG renderer for the authenticated /api/hook-preview endpoint and FFmpeg overlay. The original Unicode text stays editable and saved. Rendering uses the selected hook font, size, five-position layout, text style, and hook span; joined emoji, skin tones, flags and keycaps are matched as graphemes. Plain hooks retain their existing ASS path. Browser requests are debounced/cancelable, image caches are bounded, and unsupported symbols report an explicit error rather than silently switching emoji styles.

Artwork provenance: emoji-datasource-apple 16.0.0 (https://github.com/iamcal/emoji-data), Apple PNG artwork copyright Apple Inc. The upstream project states that its Apple images are not licensed for commercial usage; its MIT data/code license does not license the artwork. Native canvas rendering uses @napi-rs/canvas. Emoji artwork stays in the installed dependency rather than being copied into the Git repository or public static assets.

## Current Viral hooks editor (November 3, 2026)

The font menu now exposes only two platform groups: Instagram uses a clearly labeled Manrope substitute, and TikTok uses its original TikTok Sans. Both fonts are bundled at their natural width and support Cyrillic. Historical font files and IDs remain readable solely for existing job snapshots; they are no longer selectable. Sources: https://developers.tiktok.com/blog/tiktok-sans-open-source and the Google Fonts OFL distributions recorded in public/fonts/manifest.json.

New compositions/render snapshots use textLayoutVersion 3. All text sections, with or without emoji, use the same PNG renderer for preview and final FFmpeg overlays. Instagram style adds rounded white backgrounds and dark text. Apple emoji rendering is preserved. Legacy snapshots retain their earlier renderer and fonts.

Hook.text remains the first text section; optional Hook.textSettings customizes it, while Hook.sections adds extra sections with optional settings. Every section inherits the project/hook font, size, width, and style unless overridden. Additional sections stack beneath the first. Composition.textPosition is a vertical percentage, falling back to legacy position when absent; textWidth controls wrapping as a percentage. A section verticalOffset shifts its automatic position relative to the video height. All section lines are horizontally centered. Width never changes glyph advances, tracking, or horizontal scale. Custom settings can be reset to inheritance. Sections belong to one hook and do not multiply output combinations.


## Viral hooks: Russian Classic and text treatments (November 5, 2026)

New hook generations are Russian-only. The single language option displays Russian even in older projects; the backend snapshots Russian with hookPromptVersion virality-ru-v2 and sends an explicit Russian-only writing instruction. Existing job snapshots keep their original language/policy.

Instagram and the previous TikTok default entries are removed from pickers, and the Instagram white style tab is removed. The current choice is TikTok Classic - Russian (official TikTok Sans Semibold, full Cyrillic); TikTok confirms Classic uses TikTok Sans: https://developers.tiktok.com/blog/tiktok-sans-open-source . Legacy Classic is Proxima Nova Semibold. The commercial font is not bundled or substituted: import a licensed Cyrillic TTF/OTF from the hook editor to enable it. The source link points to https://www.marksimonson.com/fonts/view/proxima-nova/ . Import validates font identity, weight 600, the complete Russian alphabet including Yo, and native renderer loading. It stores one immutable font under DATA_DIR/fonts/proxima-nova-semibold.otf, outside Git/public assets. Authenticated endpoints expose availability, upload, and the browser font. Local backups include this optional file; restore it alongside the database/media. An existing installed font cannot be overwritten with a different file.

New render snapshots use textLayoutVersion 4. Text appearance is independent of the content style and has four settings: plain white, white with black outline, black on a white underlay, and white on a grey underlay. Each text section inherits appearance and can override it. Preview and FFmpeg use the same PNG renderer; Apple emoji, natural glyph widths, centered lines, size, position, and wrapping remain shared. Legacy snapshots retain their earlier fonts and rendering. The previous Instagram saved style maps to Text in current editing; its underlay maps to the new white-underlay treatment when there is no explicit appearance.


## Preview stability and software graphics (November 5, 2026)

Windows logged an unclean restart with BugcheckCode 0 after the reported PC freeze, without a BSOD/dump or a graphics reset naming a driver. The application log ended near original-media loading, but did not show a request storm, excessive hook text, or a backend exception. Those records do not establish a hardware root cause. Do not claim a system-wide hard freeze is conclusively solved by an application test.

Hook previews run in one isolated Node child process with a five-second timeout, at most eight waiting requests, and a cache limited to 12 PNGs / 4 MB. Disconnected queued requests are discarded. The renderer recycles after 40 results or a 192 MB RSS reading; its JS heap is capped at 128 MB, and full-frame canvas backing stores are explicitly released after encoding, including final renders. Preview requests debounce for 300 ms; image decoding is asynchronous. PNG resolution and output typography remain identical to final rendering. GET /api/hook-preview/status is authenticated and reports bounded renderer counters without prompt text. Use the existing API authentication on every new preview/status endpoint.

Opening Viral hooks must not attach or fetch original video/audio before an explicit Play action. Native players release their source/decoder on source changes and unmount; volume changes do not restart playback. Preserve original-quality media and Apple emoji.

On Windows, the Start desktop shortcut now opens the local interface in an isolated Chrome app window (Edge fallback) with hardware graphics/video decoding disabled. scripts/local-browser.mjs owns this launch policy and a separate browser-software profile under the private local app directory. This is an application-scoped workaround for possible driver hangs, not a change to the user's normal Chrome profile or the media quality. The isolated profile may need one initial sign-in with the existing workspace password from Workspace access.txt. Close old app tabs and use the desktop shortcut to get this mode; typing the localhost address into a regular Chrome window cannot disable that window's hardware acceleration. Closing the browser still leaves backend jobs running; no Windows auto-start is enabled. Browser caches are not part of workspace backups.


## iPhone Cyrillic Classic reference (November 5, 2026)

The user's lowercase Cyrillic Ya screenshot differs from bundled TikTok Sans, SF Pro and Proxima Nova. Comparison against the foundry's Helvetica Pro Roman lowercase Ya specimen (glyph 470, official Helvetica family) gave normalized silhouette IoU 0.9860, with matching curved lower-left stroke, bowl and stroke proportions. This is a strong glyph match, not proof of TikTok's complete internal font stack. Reference source: https://www.myfonts.com/collections/helvetica-font-linotype . Do not claim TikTok Sans or Proxima matches this reference. Research images/fonts and the user's screenshots remain in sibling maintenance storage, outside Git; do not distribute proprietary research fonts.

Added classic-iphone-helvetica, Helvetica Pro Roman at natural weight 400, as a local licensed font choice for the same preview/export renderer. The file is not bundled or fetched from font-download mirrors. A licensed Cyrillic TTF/OTF must be imported first; absent fonts stay unavailable, with an explicit import error rather than substitution. Import validates the actual font identity, weight, native loading and full Russian alphabet, rejecting Neue/World/Narrow/Condensed/Rounded/Textbook/italic variants. Successful import applies the font to the current project and clears only font overrides across hooks/sections; size, positioning, widths, styles and old job snapshots are retained. The installed font is immutable under workspace/fonts/helvetica-roman.otf and included in local backups. Existing TikTok Sans remains usable under its real name while the licensed reference file is missing. Proxima remains a separately labeled alternative.


## Free hook fonts and appearance freeze mitigation (November 5, 2026)

This supersedes the selectable commercial fonts described above. Current font choices are Nimbus Sans Regular (Classic-style Helvetica substitute, not an exact TikTok match) and Manrope Semibold (geometric alternative). Both bundle the complete Russian alphabet, including Yo. Nimbus comes unmodified from Artifex URW Base35 at pinned revision 3c0ba3b5687632dfc66526544a4e811fe0ec0cd9; its upstream LICENSE and AGPL COPYING are bundled alongside the OTF. Manrope retains the existing Google Fonts OFL binary/license. Sources and checksums are recorded in public/fonts/manifest.json. No purchase or font import is needed. Commercial import controls and their browser FontFace loading/listeners have been removed from the editor; legacy authenticated APIs/files remain only for existing snapshots.

New editing/render snapshots use textLayoutVersion 5. Current projects normalize retired font choices to free analogs; v4 snapshots still resolve the original three font IDs and original default, v3 keeps its platform mapping, and older versions retain their behavior. Do not change old queued output typography during future font changes.

The recurring hard-freeze report happened while choosing text appearance. Windows recorded another unclean restart without a diagnostic crash dump. Original video/music requests preceded the freeze; there was no backend exception or preview request storm. These facts do not identify the underlying driver or establish that the hardware freeze is fixed. At inspection, the running normal Chrome process did not have the protected software-graphics flags.

Text appearance now uses inline buttons for both defaults and section overrides, avoiding a native popup surface. Pointer/focus interaction with hook editing stops playback before controls open; changing hook text/layout and pausing unmounts video/music and releases their sources/decoders. A paused element must not keep its decoder alive in this editor. Hook PNG updates retain one image element while replacing/revoking object URLs, avoiding unmount/recreate on every setting edit. Original playback quality and Apple emoji are unchanged. Continue using the desktop Start shortcut for isolated software graphics; a normal Chrome tab does not inherit those flags.

Validation: full automated suite, real FFmpeg comparison against preview pixels for both free fonts and all four treatments, and an isolated software-browser regression covering 120 appearance clicks, both fonts, repeated step navigation, original 720x1280 playback, decoder release on edit/Pause, 50 full-resolution preview renders, and no page errors. Renderer memory/cache stayed bounded. These are application checks, not proof against all machine/driver hangs.


## Settings-based Siray pricing and native image sizes (November 8, 2026)

Siray's model cards show entry prices, not a guaranteed cost for every quality, resolution, or reference configuration. Wan 3.0 ref2v at 720p is currently $0.08 per billable second; the $0.04 headline is 480p. Its detailed pricing description bills input video duration capped at five seconds plus output duration. Thus a five-second output with a reference of at least five seconds is ten billable seconds, or $0.80 at the current 720p rate. Removing an unnecessary reference video reduces the illustrative case to $0.40, but changes the motion guidance; never remove operator references automatically. A reference clip's high source resolution does not explain this particular multiplier.

GPT Image 2.5 Sunburst t2i is token-billed. The current public quote estimates 1440x2560 at $0.012 medium / $0.047 high; prompt and actual output token usage can raise the charge. Current published token rules are $4.25/M text-input tokens, $6.80/M image-input tokens, and $25.50/M output tokens. These are dated audit observations, not fixed application prices or proof of historical invoices. The public $0.004 card is an entry figure. Past task usage can be read with the existing provider task-query endpoint without creating a new generation. Do not print provider keys, prompts, data URLs, signed URLs or account billing records.

Sources: https://console.siray.ai/model-detail/alibaba/wan-3.0-ref2v , https://console.siray.ai/model-detail/openai/gpt-image-2.5-sunburst-t2i , https://blog.siray.ai/wan-3-0-ref2v-brand-mascot-consistency/ . The browser's public pricing API is GET /api/model-verse/models/by-name?model_name=..., GET /api/model-verse/pricing?model-id=..., and POST /api/model-verse/pricing with model_id and request_params as a JSON STRING, hosted at https://api-gateway.siray.ai. Pricing calls do not run generations.

The authenticated local POST /api/pricing/estimate endpoint exposes settings-based estimates to Starting frames, Reaction videos and VidGen. It resolves Studio's actual ratio, duration, audio and one-output payload rules, obtains current public pricing metadata, and sends only non-sensitive scalar pricing dimensions to the public quote API. Prompts, API credentials and media/reference URLs are excluded. The ref2v surcharge is added from the documented formula and local asset duration for one known reference; unknown/external or multiple references show an unavailable total rather than a misleading output-only amount. Native output counts and batch counts are included once. Token-based amounts remain explicitly estimates; text-model preparation costs are separate. Failed pricing requests show unavailable, never zero. Metadata/quote caches are bounded and expire after five minutes; UI calls debounce and cancel stale requests. No paid generation is used to validate quotes.

Native image size is now visible in model options. ratioInputs preserves an explicitly selected supported native size instead of silently replacing it with an exact-ratio, potentially more expensive preset. The aspect ratio still controls local center cropping when needed; its UI warns on a conflicting selected size. Existing explicit size/quality selections and old job snapshots are retained. When no native size is chosen, the existing automatic ratio selection remains, and the estimate exposes the effective size. Do not silently reduce quality or remove references in the name of saving cost.

Regression coverage uses mocked pricing transport for reference billing, unknown totals, token estimates, count multiplication, failure and prompt/media privacy. Isolated browser checks use only free public price queries: image quality/size quotes, preserved native size after save, $0.80 with a capped reference versus $0.40 without, responsive mobile layout, and zero generation submissions. Run the production build and relevant/full suite before deployment; preserve workspace backups and check active jobs before restart.
