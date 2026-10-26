# ai video edeting machine

A project-based creative assembly line for first frames, reaction clips, viral hooks, product demos, music, and final video batches.

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

## Deploy the backend

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
2. Generate first frames from a generic prompt. `[woman/man]` and `[kitchen/office]` enumerate explicit choices. A Siray text model varies unspecified details; supported models use distinct seeds. Visual uniqueness cannot be guaranteed by an AI provider.
3. Select first frames and generate a chosen number of videos **per frame**, using model-supported durations.
4. Save product facts and generate editable hook batches (up to 1,000 hooks per request). Regeneration appends hooks; prior product details remain saved. Website import is optional and uses accessible HTML, not authenticated pages or browser automation.
5. Select reaction clips from any project, sorted by creation date.
6. Select or upload product demos.
7. Select music. **Every selected track** multiplies the output count; **Random from selection** assigns one track per visual combination; **No added music** preserves only original audio.
8. Review and edit every combination. Set hook and music spans independently, globally or per output. Exclude unwanted outputs. Click Render.
9. Watch real job status and download completed videos individually or as a ZIP.

Every step can be skipped. Skipping hook, clip, demo, or music selection omits that component without deleting saved inputs. Revisiting a step enables it again. An omitted dimension contributes one empty component to the Cartesian product. At least one reaction clip, demo, or image hook is required to render.

## Hook styles and rendering

- **Text**: white text with a dark outline, adjustable size and position.
- **Snapchat**: white text with a translucent dark background.
- **IMG**: one uploaded image per hook. Image hooks and text hooks are retained independently when switching styles.
- **Text Wall**: wrapped centered text, with 7- or 14-second opening segments. Longer clips are trimmed and shorter clips hold their last frame.
- **Green screen**: a keyed presenter over the reaction or an optional custom background, with color, similarity, edge blend, position, and scale controls. Presenter compositing follows the hook span. Use actual green-screen footage; this is chroma keying, not AI background removal.

Final output is portrait 1080×1920, 30 fps, H.264/AAC MP4. FFmpeg normalizes source clips, preserves the reaction-before-demo order, burns hooks using the selected span, and loops/trims music inside its independently selected span. Source and music volumes are independent. Fonts support Latin and Cyrillic. Browser previews indicate selected media, styles, timing scopes, and approximate keying; FFmpeg is the final composition renderer.

## Reliability and limits

- Projects, reusable products, assets, provider task IDs, and immutable render inputs are saved to SQLite. Media is private on disk or in the configured bucket.
- Generated images and videos are copied from Siray into app storage as soon as available.
- Siray image/video jobs resume by task ID after a restart. A crash or network error during an ambiguous submission is shown as **uncertain** rather than silently charging again. Check Siray before retrying such jobs.
- Canceling a provider job stops local tracking; Siray may still complete it and charge for it. Cancellation does not delete existing assets. Local FFmpeg jobs can be stopped.
- Polling/download failures can be retried against the same provider task. Failed prompt planning and hook writing may require a new text request on retry; completed chunk checkpoints are retained.
- Upload limit: 100 MB per file. Rendering limit: 100,000 combinations per batch. Split larger selections into separate batches. Outlines paginate rather than constructing the full product in browser memory.
- One operator, one backend instance, four queued workers with at most one FFmpeg render. Authentication sessions expire after seven days or a server restart. The frontend URL and session token stay in the browser; Siray keys are stored encrypted only on the backend.
- Model adapters follow Siray’s published per-model schemas. Use Refresh model availability to check the current API key’s catalog. Unsupported durations are not submitted.

## Verification

```sh
npm run check
npm test
npm run build
```

Tests cover the four-dimensional Cartesian product, skipped dimensions, random-track assignment semantics, separate hook/music timing, explicit prompt choices, model-specific payloads, and real FFmpeg outputs with audio measured before and after the reaction/demo boundary. They make no paid AI calls.

## Architecture

React/Vite frontend · Fastify API · SQLite durable queue · private S3-compatible or disk media storage · Siray text/image/video adapters · FFmpeg compositor. No credentials, project data, or generated media are committed to Git.
