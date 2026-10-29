# ai video edeting machine

A project-based creative assembly line for first frames, reaction clips, viral hooks, product demos, music, and final video batches.

## Local browser app (current setup)

The interface and backend run together at **http://127.0.0.1:3001** on this PC. Siray handles AI generation; local FFmpeg handles final composition. No VPS, Docker, or GitHub Pages connection is needed for local operation.

- Use the **Start AI Video Edeting Machine** desktop shortcut to start the hidden backend and open your default browser. Repeated launches reuse the same backend.
- Use **Stop AI Video Edeting Machine** to stop the backend. Closing the browser leaves the backend and queued jobs running; the PC must remain awake. Browser file transfers require the browser to stay open.
- First sign-in uses the workspace password in `%LOCALAPPDATA%\AI Video Edeting Machine\Workspace access.txt`. Enter the Siray API key separately in Settings. The existing password/encryption key were retained from the private configuration backup; the encrypted Siray settings database was not available.
- Projects, originals, previews, private configuration, rotating logs, and backups live under `%LOCALAPPDATA%\AI Video Edeting Machine`, with access restricted to the Windows user and SYSTEM. They are outside this repository.
- This is a **fresh local workspace**, as requested. VPS projects/media were not imported; the unreachable VPS and verified backups remain untouched.
- Music accepts MP3, WAV, and M4A. Large batches run one file at a time, show progress and cancellation, preserve successful files, and report corrupt files individually. Music does not decode automatically during upload; playback uses the original files.

To install on another Windows PC with Node 24+, run the following from the repository, then use the desktop shortcut:

```powershell
npm.cmd ci --ignore-scripts
npm.cmd rebuild esbuild ffmpeg-static
npm.cmd run build
npm.cmd run local:setup
npm.cmd run local:start
```

Setup creates a fresh workspace only when no initialized profile exists; it does not overwrite an existing database. A conflicting service on port 3001 produces an error rather than being killed. Automatic Windows sign-in startup is not enabled.

### Local backup and recovery

Run `npm.cmd run local:backup` after jobs finish, or after stopping the backend. The backup contains a consistent SQLite snapshot, original media referenced by it, private configuration, profile identity, and a SHA-256 manifest. Treat backups as private because they include the encryption key and workspace credentials. Keep an additional copy on a separate drive.

To restore, stop the backend and preserve the current profile in a separate backup first. Restore the backup's `workspace` directory, `config.env`, and `profile.json` into the local profile directory; verify file sizes and hashes against `manifest.json` before starting. Keep these files together so the database's encrypted settings remain readable. Cached previews can be regenerated. Do not merge a future VPS export over new local projects without a separate verified migration.

`npm.cmd run local:stop` and `npm.cmd run local:start` are command-line equivalents of the shortcuts. Runtime logs rotate under the profile's `logs` directory. Set `QUEUE_ENABLED=0` when running the server manually for migration validation; the launcher also supports `node scripts/local.mjs start --paused` when the backend is stopped.

**Outputs = hooks × reaction clips × product demos × music tracks.** Hook and music spans are independent: whole video, reaction only, or demo only. Each output pairing and span can be edited in the task outline.

## Run locally

Requires Node.js 24 or later.

```sh
npm ci
npm approve-scripts esbuild ffmpeg-static
npm rebuild esbuild ffmpeg-static
cp .env.example .env
npm run server
# In a second terminal:
npm run dev
```

Open the Vite Local URL (normally http://localhost:5173). The development backend listens on http://127.0.0.1:3001. Without `APP_PASSWORD` it binds only to loopback; production requires a password and encryption key.

In Settings, connect the backend, enter your Siray API key, and test it. The frontend can save local project drafts before a backend is connected; generation, uploads, and rendering require the backend. Browser drafts do not contain media or API keys.

## Optional VPS deployment (previous hosting setup)

Use Ubuntu Server 24.04 LTS with Docker Engine and Docker Compose. The existing application runs without a provider-specific database or queue service.

- Clone the repository to `/srv/ai-video-edeting-machine/source`.
- Create `/srv/ai-video-edeting-machine/data` owned by UID/GID 1000 with mode 700. This holds the database, media, work files, and encrypted settings.
- Create `/etc/ai-video-edeting-machine/app.env` readable only by root, setting `APP_PASSWORD`, `ENCRYPTION_KEY`, `FRONTEND_ORIGIN=https://dulyan.github.io`, `PUBLIC_API_URL` to the public HTTPS backend address, and `DATA_DIR=/data`. Use unique random values for the password and encryption key, and retain the encryption key across deployments.
- Run `docker compose -f deploy/compose.yml up -d --build` from the source checkout. The API listens only on the host's loopback interface; put Nginx or another HTTPS reverse proxy in front of `/api/`. Allow at least 110 MB HTTP bodies for multipart uploads, and disable proxy buffering for streamed media/ZIP downloads.
- The supplied Compose configuration uses a non-root container, a 2 GB memory limit, two CPU cores, bounded container logs, and automatic restart after reboot. Adjust those resource limits for the actual server after benchmarking.
- Configure HTTPS and automatic certificate renewal. A domain works normally; Let's Encrypt also supports short-lived public-IP certificates with Certbot 5.4+ using `--preferred-profile shortlived --ip-address ADDRESS --webroot`. IP certificates need frequent automatic renewal and a webserver reload hook.
- Back up the SQLite database using SQLite's backup API, plus the media directory and root-only environment file. Retain an off-server copy. Do not delete the encryption key or regenerate it on redeployment.
- Set the GitHub repository variable `VITE_API_URL` to the backend HTTPS URL and run the Pages workflow, or enter the URL manually in the app Settings. The API key belongs in the app Settings, not a frontend build variable.

## Deploy the backend on Railway

The frontend is deployed to GitHub Pages by the included workflow. GitHub Pages cannot run FFmpeg or background jobs. Deploy the included backend to Railway:

1. Create a Railway project from this GitHub repository. The root Dockerfile and `railway.json` configure the Node/FFmpeg service.
2. Attach a persistent volume at `/data`. Keep one service instance and disable sleeping/serverless mode so queued jobs run while the browser is closed.
3. Set these Railway secret variables:
   - `APP_PASSWORD`: a strong, unique operator password.
   - `ENCRYPTION_KEY`: a securely generated random value, at least 32 bytes. Preserve it across redeployments; it encrypts your Siray key and signs media links.
   - `FRONTEND_ORIGIN`: `https://dulyan.github.io` (an origin, without the repository path).
   - `PUBLIC_API_URL`: the generated public HTTPS Railway service URL, without a trailing slash.
4. Generate a public service domain. The `/api/health` endpoint must return `ok: true`.
5. Recommended: add a **private Railway storage bucket** and set `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` using its credentials. Keep the SQLite database on the volume. Without bucket settings, files use `/data/media` on the persistent volume.
6. Set a bucket CORS rule allowing `GET`/`HEAD` from `https://dulyan.github.io` if using browser green-screen canvas previews. Regular media playback and server rendering use signed URLs/private object access.
7. Open the frontend Settings page and connect with the backend URL and operator password. Optionally set GitHub repository variable `VITE_API_URL` and rerun the Pages workflow to prefill the backend URL for every browser. Enter your Siray key through the app Settings, never in GitHub source or frontend build variables.
8. Enable daily Railway volume backups. The SQLite database contains all projects, products, encrypted settings, job manifests, and asset references. Retain bucket objects separately; volume backups do not back up the bucket. Never change `ENCRYPTION_KEY` without migrating encrypted settings.

Railway hosting and Siray usage are separate costs. Configure Railway usage alerts for your account. Start with a small service; FFmpeg renders are processed one at a time with two encoding threads. Storage grows with output count.

## Workflow

1. Name a project (or keep the generated name).
2. Generate starting frames in two visible phases. **Fixed image instructions** appear first and begin every image prompt verbatim. **Random elements instructions** describe the age, gender, ethnicity, background, and other factors to choose automatically or vary, in plain text. Select the text model, text-to-image model, output count, and ratio. The text model reads both sections, then streams only concrete scene details with maximum diversity inside your written constraints. There is no Starting frames Variation slider. The app assembles each image prompt as the unchanged fixed block, two newline characters, and its generated details (or just the details if the fixed block is empty). Raw random-elements instructions are not appended to the image prompt. Only after all N descriptions are saved does the app create N image jobs. Provider output is not a guarantee of visual uniqueness.
3. Select first frames and generate a chosen number of videos **per frame**, with a separate text model on the step for prompt preparation, an image-to-video model, supported duration, and aspect ratio. Text-to-image selectors exclude image editors; image-to-video selectors exclude unrelated text-to-video and motion-control workflows.
4. Save product facts and generate editable hook batches (up to 1,000 hooks per request). Regeneration appends hooks; prior product details remain saved. Website import is optional and uses accessible HTML, not authenticated pages or browser automation.
5. Select reaction clips from any project, sorted by creation date.
6. Select or upload product demos.
7. Select music. **Every selected track** multiplies the output count; **Random from selection** assigns one track per visual combination; **No added music** preserves only original audio.
8. Review and edit every combination. Set hook and music spans independently, globally or per output. Exclude unwanted outputs. Click Render.
9. Watch real job status and download completed videos individually or as a ZIP.

Prompt drafts, completed unique prompts, media job progress, and saved previews update through an authenticated event stream. A disconnected browser reconnects automatically. Partial prompt batches persist and can resume; media is not submitted for an incomplete batch. Ratio controls cover first frames, reaction clips, and final rendered videos. Model-native ratios/dimensions are used where supported; otherwise generated media is center-cropped after downloading, as shown in the form.

Prompt preparation uses up to four concurrent single-prompt requests across the backend. The selected model is preserved; GPT-5, GPT-5 mini, and GPT-5 nano use minimal reasoning for this preparation task. The parser accepts pretty-printed, fenced, and multiline JSON as well as a single plain-text prompt. Live status distinguishes waiting for the model from receiving text and records request timing. Resume and cancel requests work without a JSON body, including requests from older open browser sessions.

Each new starting-frame result keeps its exact final prompt and the fixed/generated sections. Live cards show generated details; **View full image prompt** and the asset inspector show both sections with an exact-prompt copy button. Image presets save both fields together. Existing project/preset text remains unchanged under the renamed Random elements instructions field. Legacy variation values remain readable; new batches always use maximum diversity. Load **UGC portrait** to apply the revised built-in defaults to an existing project. Previously queued jobs and saved outputs retain their original snapshots. Reaction-video prompting remains unchanged.

Every step can be skipped. Skipping hook, clip, demo, or music selection omits that component without deleting saved inputs. Revisiting a step enables it again. An omitted dimension contributes one empty component to the Cartesian product. At least one reaction clip, demo, or image hook is required to render.

## Hook styles and rendering

- **Text**: white text with a dark outline, adjustable size and position.
- **Snapchat**: white text with a translucent dark background.
- **IMG**: one uploaded image per hook. Image hooks and text hooks are retained independently when switching styles.
- **Text Wall**: wrapped centered text, with 7- or 14-second opening segments. Longer clips are trimmed and shorter clips hold their last frame.
- **Green screen**: a keyed presenter over the reaction or an optional custom background, with color, similarity, edge blend, position, and scale controls. Presenter compositing follows the hook span. Use actual green-screen footage; this is chroma keying, not AI background removal.

Final output is portrait 1080×1920, 30 fps, H.264/AAC MP4. FFmpeg normalizes source clips, preserves the reaction-before-demo order, burns hooks using the selected span, and loops/trims music inside its independently selected span. Source and music volumes are independent. Fonts support Latin and Cyrillic. Browser previews indicate selected media, styles, timing scopes, and approximate keying; FFmpeg is the final composition renderer.

## Reliability and limits

- Server snapshots and write acknowledgements carry a durable SQLite revision. The browser preserves pending field edits and rejects older live/GET snapshots, so late updates cannot undo text, selections, or navigation. Offline project, product, and preset edits are retained for reconnect. Generation and rendering wait for project saves to complete.
- Library cards use still thumbnails and paginate at 24 assets. Video/audio playback starts only on Play and uses the original files, without reduced-resolution or recompressed playback copies. Green-screen compositing remains an approximate browser preview; its processing is bounded and stops outside active playback.
- Projects, reusable products, assets, provider task IDs, and immutable render inputs are saved to SQLite. Media is private on disk or in the configured bucket.
- Generated images and videos are copied from Siray into app storage as soon as available.
- Siray image/video jobs resume by task ID after a restart. A crash or network error during an ambiguous submission is shown as **uncertain** rather than silently charging again. Check Siray before retrying such jobs.
- Canceling a provider job stops local tracking; Siray may still complete it and charge for it. Cancellation does not delete existing assets. Local FFmpeg jobs can be stopped.
- Polling/download failures can be retried against the same provider task. Failed prompt planning and hook writing may require a new text request on retry; completed chunk checkpoints are retained.
- Upload limit: 100 MB per file. Rendering limit: 100,000 combinations per batch. Split larger selections into separate batches. Outlines paginate rather than constructing the full product in browser memory.
- One operator, one backend instance, four queued workers with at most one FFmpeg render. Authentication sessions expire after seven days and persist across server restarts. The frontend URL and session token stay in the browser; Siray keys are stored encrypted only on the backend.
- Model adapters follow Siray’s published per-model schemas. Use Refresh model availability to check the current API key’s catalog. Unsupported durations are not submitted.
- Model selection uses [Siray Model Verse](https://api-gateway.siray.ai/api/model-verse/models) schemas and the authenticated [Models API](https://docs.siray.ai/api-reference/models). A bundled snapshot contains all 175 published text/image/video models as of October 26, 2026 (37 text, 58 image, 80 video); the backend refreshes the catalog every ten minutes and on request. Models unavailable to the saved key are disabled. Workflow pickers show only models compatible with each action. The broader catalog is retained for capability metadata; editing and unrelated video modes are excluded from first-frame and reaction generation.
- Choose hook-writing and prompt-generation models directly on their workflow steps. Choices are saved with the project and snapshotted into each job. Settings holds the text model used for product-details import. Test calls in this repository do not spend provider credits.

## Verification

```sh
npm run check
npm test
npm run build
```

Tests cover the four-dimensional Cartesian product, skipped dimensions, random-track assignment semantics, separate hook/music timing, explicit prompt choices, model-specific payloads, and real FFmpeg outputs with audio measured before and after the reaction/demo boundary. They make no paid AI calls.

## Architecture

React/Vite frontend · Fastify API · SQLite durable queue · private S3-compatible or disk media storage · Siray text/image/video adapters · FFmpeg compositor. No credentials, project data, or generated media are committed to Git.







Reference-pose generation has been removed from the current Starting frames workflow. New split-image-v3 batches do not send or save reference lists, even if an older project or preset contains one. Revised fixed defaults cover UGC realism, camera, naturally attractive/athletic avatars, coherent backgrounds and lighting, and happy, pleasantly surprised excitement with a gentle closed-lip smile. Random-elements defaults auto-choose adult age, gender, ethnicity, background, appearance, posture, and action. Legacy v1/v2 batches retain their original snapshots and variation when resumed.

Workspace sessions persist across backend restarts for their existing seven-day lifetime. Only token hashes are stored in the private SQLite auth_sessions table; changing the workspace password or encryption key invalidates them, and logout revokes them immediately. After upgrading from in-memory sessions, existing browser tokens require one sign-in.

Reaction videos use split-video-v2: a selectable text model generates one unique action/optional Russian utterance per output. Fixed video instructions are preserved verbatim. Descriptions are randomly assigned to source frames with the requested count per frame; assignments and partial prompts survive retries. Speech declarations allow only Russian and at most three words. Native audio is enabled where supported; no application silence, freeze-lips, CFG override, or automatic matching end frame is applied. Outputs are capped at five seconds; models with longer minimum generations are supported by trimming, with a visible billing-duration note. Pre-change projects display the new randomized defaults until edited; old jobs keep their snapshots.

## Hook fonts and virality

Viral hooks supports a project default font plus an optional override on each text hook. Use the default-for-all action to clear overrides. Font choices are Montserrat, Poppins, Anton, Bebas Neue, Oswald, Inter, Roboto, Open Sans, Playfair Display, and Caveat. Bundled Google Fonts TTFs and OFL licenses live in public/fonts; browser and FFmpeg select the same family. For Cyrillic, Poppins falls back to Montserrat, and Anton/Bebas Neue to Oswald. Old queued render snapshots retain their legacy font.

Virality 1 means neutral product facts; 10 means industry-first curiosity with a relevant unanswered question. Intermediate values progressively broaden the framing. This is a writing direction, not a prediction of views. Product descriptions, pain points, cost of inaction, solution, and proof ground all levels. Do not invent claims or promises. New hook jobs snapshot the chosen level and product context for retries; existing jobs retain their previous policy.

The ten-font list is curated, not a verified CapCut trend ranking. CapCut does not provide a public ranked usage leaderboard in the sources reviewed. Sources include https://www.capcut.com/resource/anton-font , https://www.capcut.com/resource/subtitle-font , https://www.capcut.com/resource/poppins-font and https://www.capcut.com/resource/youtube-thumbnail-font . Inter and Caveat round out the shortlist as caption/design choices, without a claim of universal built-in availability. Font provenance and checksums: public/fonts/manifest.json. Refresh the vendored assets with node scripts/fetch-hook-fonts.mjs only when deliberately updating them.
