import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  FolderOpen,
  Image as ImageIcon,
  Film,
  Settings as SettingsIcon,
  Plus,
  Search,
  Sun,
  Moon,
  Monitor,
  KeyRound,
  Link2,
  ShieldCheck,
  LogOut,
  ExternalLink,
  Loader2,
  Menu,
  X,
  Sparkles,
  Layers,
  Wifi,
  WifiOff,
  Play,
  CheckCircle2,
} from "lucide-react";
import type { Asset, Project } from "../shared/types.ts";
import {
  STEPS,
  combinationCount,
  excludedCount,
  effectiveProject,
} from "../shared/project.ts";
import { useWorkspace, type Workspace } from "./workspace.tsx";
import {
  AssetCard,
  AssetGrid,
  Button,
  EmptyState,
  Field,
  Inspector,
  Modal,
} from "./components.tsx";
import {
  Generation,
  Hooks,
  LibraryChooser,
  Naming,
  Outline,
  Status,
} from "./Workflow.tsx";
import { ModelPicker, useModels } from "./ModelPicker.tsx";
import { backendURL, configureBackend, request } from "./api.ts";
import type { ProjectUpdate } from "./workspace-sync.ts";
type Page =
  "Studio" | "Projects" | "Image Library" | "Video Library" | "Settings";
const stepSubtitles = [
  "Every great video starts with a little idea.",
  "One brief. A fresh perspective in every frame.",
  "Turn still moments into scroll-stopping reactions.",
  "Find the words that make them stop and watch.",
  "The right reaction makes all the difference.",
  "Let your product have its moment.",
  "A good story deserves a good soundtrack.",
  "All the pieces, perfectly in place.",
  "From your first idea to your final cuts.",
];
function Settings({
  w,
  theme,
  setTheme,
}: {
  w: Workspace;
  theme: string;
  setTheme: (t: string) => void;
}) {
  const { models } = useModels(w.connected);
  const [url, setURL] = useState(backendURL),
    [password, setPassword] = useState(""),
    [key, setKey] = useState(""),
    [configured, setConfigured] = useState(false),
    [suffix, setSuffix] = useState(""),
    [textModel, setTextModel] = useState("openai/gpt-4.1-mini");
  useEffect(() => {
    if (w.connected)
      void request("/settings")
        .then((s) => {
          setConfigured(s.keyConfigured);
          setSuffix(s.keySuffix);
          setTextModel(s.textModel);
        })
        .catch(() => {});
  }, [w.connected]);
  async function connect() {
    const parsed = new URL(url);
    if (
      !["https:", "http:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      (parsed.protocol === "http:" &&
        !["localhost", "127.0.0.1"].includes(parsed.hostname))
    )
      throw new Error(
        "Use an HTTPS backend URL (HTTP is allowed for localhost).",
      );
    w.setConnected(false);
    configureBackend(url, "");
    const result = await request("/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    configureBackend(url, result.token);
    await w.sync();
    setPassword("");
    w.notify("Backend connected. Local drafts were imported.");
  }
  return (
    <div className="settings-grid">
      <section className="card settings-card">
        <span className="icon-disc">
          <Sun size={20} />
        </span>
        <h3>Appearance</h3>
        <p>Choose a light, dark, or system theme.</p>
        <div className="theme-options">
          {[
            { value: "light", label: "Light", icon: Sun },
            { value: "dark", label: "Dark", icon: Moon },
            { value: "system", label: "System", icon: Monitor },
          ].map((item) => (
            <button
              className={theme === item.value ? "active" : ""}
              key={item.value}
              onClick={() => setTheme(item.value)}
            >
              <div className={`theme-swatch ${item.value}`}>
                <i />
                <i />
                <i />
              </div>
              <span>
                <item.icon size={15} />
                {item.label}
                {theme === item.value && <Check size={15} />}
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="card settings-card">
        <span className="icon-disc coral">
          <Link2 size={20} />
        </span>
        <h3>Workspace connection</h3>
        <p>
          Connect the private service that stores media and runs generations and
          renders.
        </p>
        <Field label="Backend URL">
          <input
            type="url"
            placeholder="https://46.62.236.47"
            value={url}
            onChange={(e) => setURL(e.target.value)}
          />
        </Field>
        <Field label="Workspace password">
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your backend’s workspace password"
          />
        </Field>
        <div className="settings-actions">
          <Button
            variant="black"
            disabled={!!w.busy || !url}
            onClick={() => void w.act("Connecting", connect)}
          >
            {w.busy === "Connecting" ? (
              <Loader2 className="spin" size={15} />
            ) : (
              <Wifi size={15} />
            )}{" "}
            Connect backend
          </Button>
          {w.connected && (
            <Button
              onClick={() =>
                void w.act("Signing out", async () => {
                  await request("/logout", { method: "POST" });
                  configureBackend(backendURL, "");
                  w.setConnected(false);
                  w.notify("Signed out of the backend.");
                })
              }
            >
              <LogOut size={15} /> Sign out
            </Button>
          )}
        </div>
        <a
          className="text-link"
          href="https://github.com/dulyan/ai-video-edeting-machine#deploy-on-a-vps-hetzner-contabo-or-another-docker-host"
          target="_blank"
          rel="noreferrer"
        >
          Backend deployment instructions <ArrowUpRight size={14} />
        </a>
      </section>
      <section className="card settings-card">
        <span className="icon-disc coral">
          <KeyRound size={20} />
        </span>
        <h3>Siray API key</h3>
        <p>
          Your Siray key powers image, video, and hook generation. It is
          encrypted in your backend.
        </p>
        {configured && (
          <div className="key-status">
            <ShieldCheck size={17} />
            <span>API key saved · ending in {suffix}</span>
          </div>
        )}
        <Field label="Siray API key">
          <input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={
              configured
                ? "Enter a new key to replace it"
                : "Paste your Siray API key"
            }
          />
        </Field>
        <ModelPicker
          label="Product details import model"
          models={models.filter((m) => m.kind === "text")}
          value={textModel}
          onChange={setTextModel}
        />
        <div className="settings-actions">
          <Button
            variant="primary"
            disabled={!w.connected || !!w.busy}
            onClick={() =>
              void w.act("Saving key", async () => {
                await request("/settings", {
                  method: "PUT",
                  body: JSON.stringify({
                    ...(key ? { apiKey: key } : {}),
                    textModel,
                  }),
                });
                if (key) {
                  setConfigured(true);
                  setSuffix(key.slice(-4));
                  setKey("");
                }
                w.notify("API settings saved securely.");
                window.dispatchEvent(new Event("models-changed"));
              })
            }
          >
            Save settings <Check size={15} />
          </Button>
          <Button
            disabled={!w.connected || !configured || !!w.busy}
            onClick={() =>
              void w.act("Testing key", async () => {
                const result = await request("/settings/test", {
                  method: "POST",
                });
                w.notify(
                  `Connected to Siray. ${result.models} models available.`,
                );
              })
            }
          >
            Test key
          </Button>
          {configured && (
            <button
              className="text-button"
              onClick={() =>
                void w.act("Removing key", async () => {
                  await request("/settings", {
                    method: "PUT",
                    body: JSON.stringify({ apiKey: "" }),
                  });
                  setConfigured(false);
                  setSuffix("");
                  w.notify("Siray key removed.");
                })
              }
            >
              Remove
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
function Library({
  w,
  kind,
  inspect,
}: {
  w: Workspace;
  kind: "image" | "video";
  inspect: (a: Asset) => void;
}) {
  const [search, setSearch] = useState(""),
    [sort, setSort] = useState("newest"),
    [project, setProject] = useState("all"),
    [category, setCategory] = useState("all");
  const assets = w.data.assets
    .filter(
      (a) =>
        (kind === "image"
          ? a.mime.startsWith("image/")
          : a.mime.startsWith("video/")) &&
        a.name.toLowerCase().includes(search.toLowerCase()) &&
        (project === "all" || a.projectId === project) &&
        (category === "all" || a.kind === category),
    )
    .sort((a, b) =>
      sort === "newest"
        ? b.createdAt.localeCompare(a.createdAt)
        : a.createdAt.localeCompare(b.createdAt),
    );
  return (
    <>
      <div className="library-toolbar">
        <div className="search-input">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your library…"
            aria-label="Search assets"
          />
        </div>
        <select
          value={project}
          onChange={(e) => setProject(e.target.value)}
          aria-label="Project filter"
        >
          <option value="all">All projects</option>
          {w.data.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || "Untitled project"}
            </option>
          ))}
        </select>
        {kind === "video" && (
          <select
            aria-label="Media type"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All videos</option>
            <option value="reaction">Reaction clips</option>
            <option value="demo">Product demos</option>
            <option value="presenter">Presenters</option>
            <option value="output">Final renders</option>
          </select>
        )}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Date sort"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>
      <div className="section-heading">
        <h3>
          {assets.length} {kind === "image" ? "images" : "videos"}
        </h3>
        <span className="muted-text">A home for every creation.</span>
      </div>
      {assets.length ? (
        <AssetGrid assets={assets} className="full-library">
          {(a) => (
            <AssetCard key={a.id} asset={a} onInspect={inspect} />
          )}
        </AssetGrid>
      ) : (
        <section className="card">
          <EmptyState
            icon={kind === "image" ? "image" : "film"}
            title={`Your ${kind === "image" ? "image" : "video"} library starts with an idea.`}
            description="Generated and uploaded media from your projects will live here, ready to use again."
          />
        </section>
      )}
    </>
  );
}
export default function App() {
  const w = useWorkspace(),
    [page, setPage] = useState<Page>("Studio"),
    [projectId, setProjectId] = useState(
      localStorage.getItem("avem.current") || "",
    ),
    [theme, setTheme] = useState(localStorage.getItem("avem.theme") || "light"),
    [inspected, setInspected] = useState<Asset>(),
    [mobileMenu, setMobileMenu] = useState(false),
    [search, setSearch] = useState("");
  const p =
    w.data.projects.find((p) => p.id === projectId) || w.data.projects[0];
  useEffect(() => {
    localStorage.setItem("avem.theme", theme);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      (document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    if (p) localStorage.setItem("avem.current", p.id);
  }, [p?.id]);
  if (!p)
    return (
      <div className="loading-screen">
        <Loader2 className="spin" /> Opening your studio…
      </div>
    );
  const update = (patch: ProjectUpdate) => w.updateProject(p.id, patch),
    step = p.step;
  async function createProject() {
    const next = await w.addProject();
    setProjectId(next.id);
    setPage("Studio");
    setMobileMenu(false);
  }
  function navigate(next: number) {
    update({
      ...(next !== 0 && !p.name.trim()
        ? {
            name:
              "Untitled project · " +
              new Date().toLocaleDateString("en", {
                month: "short",
                day: "numeric",
              }),
          }
        : {}),
      step: next,
      skipped: p.skipped.filter((s) => s !== next),
    });
    setPage("Studio");
    setMobileMenu(false);
  }
  function skip() {
    update({
      ...(step === 0 && !p.name.trim()
        ? {
            name:
              "Untitled project · " +
              new Date().toLocaleDateString("en", {
                month: "short",
                day: "numeric",
              }),
          }
        : {}),
      skipped: [...new Set([...p.skipped, step])],
      step: Math.min(8, step + 1),
    });
  }
  const props = { p, w, update, inspect: setInspected },
    total = combinationCount(p),
    effective = effectiveProject(p),
    activeJobs = w.data.jobs.filter(
      (j) => j.projectId === p.id && ["queued", "running"].includes(j.status),
    ).length;
  const icons = [
    FolderOpen,
    ImageIcon,
    Film,
    Sparkles,
    Layers,
    Clapperboard,
    Play,
    SettingsIcon,
    CheckCircle2,
  ];
  const today = new Date().toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <a
          className="brand"
          href="#studio"
          onClick={(e) => {
            e.preventDefault();
            setPage("Studio");
          }}
        >
          <div className="brand-mark">
            <Play size={18} fill="currentColor" />
          </div>
          <div>
            ai video
            <br />
            <strong>edeting machine</strong>
          </div>
        </a>
        <button
          className="mobile-close icon-button"
          onClick={() => setMobileMenu(false)}
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="main-nav">
          {(
            [
              { name: "Studio", icon: Clapperboard },
              { name: "Projects", icon: FolderOpen },
              { name: "Image Library", icon: ImageIcon },
              { name: "Video Library", icon: Film },
            ] as const
          ).map((item) => (
            <button
              className={page === item.name ? "active" : ""}
              key={item.name}
              onClick={() => {
                setPage(item.name);
                setMobileMenu(false);
              }}
            >
              <item.icon size={18} />
              <span>{item.name}</span>
              {item.name === "Studio" ? null : item.name === "Projects" ? (
                <span className="nav-count">{w.data.projects.length}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <div className="sidebar-label">
          YOUR PROJECT <span>{String(step + 1).padStart(2, "0")} / 09</span>
        </div>
        <div className="project-switch">
          <FolderOpen size={15} />
          <select
            aria-label="Current project"
            value={p.id}
            onChange={(e) => {
              setProjectId(e.target.value);
              setPage("Studio");
            }}
          >
            {w.data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || "Untitled project"}
              </option>
            ))}
          </select>
          <ChevronDown size={13} />
        </div>
        <nav className="step-nav">
          {STEPS.map((label, i) => (
            <button
              key={label}
              className={
                page === "Studio" && step === i
                  ? "active"
                  : i < step
                    ? "past"
                    : ""
              }
              onClick={() => navigate(i)}
            >
              <span className="step-number">
                {p.skipped.includes(i) ? (
                  "—"
                ) : i < step ? (
                  <Check size={12} />
                ) : (
                  String(i + 1).padStart(2, "0")
                )}
              </span>
              <span>{label}</span>
              {page === "Studio" && step === i && (
                <span className="step-active-dot" />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`settings-nav ${page === "Settings" ? "active" : ""}`}
            onClick={() => {
              setPage("Settings");
              setMobileMenu(false);
            }}
          >
            <SettingsIcon size={18} /> Settings{" "}
            <span
              className={`connection-light ${w.connected ? "connected" : ""}`}
            />
          </button>
          <div className="operator">
            <div>
              <strong>My workspace</strong>
              <small>
                {w.connected
                  ? "Backend connected"
                  : "Local drafts · connect backend"}
              </small>
            </div>
            <button
              className="icon-button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </aside>
      {mobileMenu && (
        <button
          className="sidebar-scrim"
          onClick={() => setMobileMenu(false)}
          aria-label="Close navigation"
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            onClick={() => setMobileMenu(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumbs">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{page === "Studio" ? "Creative studio" : page}</strong>
          </div>
          <div className="topbar-right">
            <button
              className={`backend-pill ${w.connected ? "online" : ""}`}
              onClick={() => setPage("Settings")}
            >
              {w.connected ? <Wifi size={13} /> : <WifiOff size={13} />}{" "}
              {w.connected ? "Connected" : "Connect backend"}
            </button>
            <Button
              className="new-project"
              onClick={() => void w.act("Creating project", createProject)}
            >
              <Plus size={15} /> New project
            </Button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <h1>{page === "Studio" ? p.name || "New project" : page}</h1>
          </div>
          {page === "Studio" ? (
            <>
              <div className="workflow-top">
                <div className="workflow-current">
                  <span className="current-step-number">
                    {String(step + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <span>STEP {step + 1} OF 9</span>
                    <h2>{STEPS[step]}</h2>
                  </div>
                </div>
                <div className="autosave">
                  <span className="tiny-dot" />
                  {w.connected ? w.saving ? "Saving changes…" : "Saved to workspace" : "Draft saved locally"}
                </div>
              </div>
              <div className="step-content" key={`${p.id}-${step}`}>
                {step === 0 ? (
                  <Naming {...props} />
                ) : step === 1 ? (
                  <Generation {...props} mode="image" />
                ) : step === 2 ? (
                  <Generation {...props} mode="video" />
                ) : step === 3 ? (
                  <Hooks {...props} />
                ) : step === 4 ? (
                  <LibraryChooser {...props} kind="reaction" />
                ) : step === 5 ? (
                  <LibraryChooser {...props} kind="demo" />
                ) : step === 6 ? (
                  <LibraryChooser {...props} kind="music" />
                ) : step === 7 ? (
                  <Outline {...props} />
                ) : (
                  <Status {...props} />
                )}
              </div>
              <footer className="workflow-footer">
                <div>
                  <span className="footer-status">
                    {activeJobs > 0 ? (
                      <>
                        <Loader2 size={14} className="spin" />
                        {activeJobs} jobs in progress
                      </>
                    ) : (
                      <>
                        <Layers size={14} />
                        {Math.max(
                          0,
                          total - excludedCount(p),
                        ).toLocaleString()}{" "}
                        possible output{total === 1 ? "" : "s"}
                      </>
                    )}
                  </span>
                  <span className="footer-project">
                    {p.name || "Untitled project"}
                  </span>
                </div>
                <div className="footer-buttons">
                  {step > 0 && (
                    <Button variant="ghost" onClick={() => navigate(step - 1)}>
                      <ArrowLeft size={15} /> Back
                    </Button>
                  )}
                  {step < 8 && (
                    <button className="skip-button" onClick={skip}>
                      Skip step
                    </button>
                  )}
                  {step === 7 ? (
                    <Button
                      variant="primary"
                      disabled={!!w.busy}
                      onClick={() =>
                        void w.act("Queueing render", async () => {
                          await w.render(p.id);
                          update({ step: 8 });
                        })
                      }
                    >
                      <Clapperboard size={16} />
                      Render{" "}
                      {Math.max(
                        0,
                        total - excludedCount(p),
                      ).toLocaleString()}{" "}
                      videos <ArrowUpRight size={16} />
                    </Button>
                  ) : step < 8 ? (
                    <Button variant="black" onClick={() => navigate(step + 1)}>
                      Continue <ArrowRight size={16} />
                    </Button>
                  ) : (
                    <Button variant="black" onClick={() => navigate(7)}>
                      Review & render <ArrowRight size={16} />
                    </Button>
                  )}
                </div>
              </footer>
            </>
          ) : page === "Settings" ? (
            <Settings w={w} theme={theme} setTheme={setTheme} />
          ) : page === "Projects" ? (
            <>
              <div className="library-toolbar">
                <div className="search-input">
                  <Search size={16} />
                  <input
                    placeholder="Find a project…"
                    aria-label="Search projects"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="projects-grid">
                <button
                  className="new-project-card"
                  onClick={() => void w.act("Creating project", createProject)}
                >
                  <span>
                    <Plus size={28} />
                  </span>
                  <strong>A fresh start.</strong>
                  <small>Create a new project</small>
                </button>
                {w.data.projects
                  .filter((p) =>
                    (p.name || "Untitled project")
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((project) => (
                    <button
                      className="card project-card"
                      key={project.id}
                      onClick={() => {
                        setProjectId(project.id);
                        setPage("Studio");
                      }}
                    >
                      <div className="project-card-top">
                        <span className="project-card-icon">
                          <Clapperboard size={24} />
                        </span>
                        <ArrowUpRight size={20} />
                      </div>
                      <h3>{project.name || "Untitled project"}</h3>
                      <p>
                        Step {project.step + 1} · {STEPS[project.step]}
                      </p>
                      <div className="project-card-bottom">
                        <span>
                          {new Date(project.updatedAt).toLocaleDateString(
                            undefined,
                            { month: "short", day: "numeric" },
                          )}
                        </span>
                        <span>
                          {
                            w.data.assets.filter(
                              (a) =>
                                a.projectId === project.id &&
                                a.kind === "output",
                            ).length
                          }{" "}
                          final cuts
                        </span>
                      </div>
                    </button>
                  ))}
              </div>
            </>
          ) : (
            <Library
              w={w}
              kind={page === "Image Library" ? "image" : "video"}
              inspect={setInspected}
            />
          )}
        </main>
      </div>
      {w.notice && (
        <div className="toast" role="status">
          <span className="toast-icon">
            <Sparkles size={17} />
          </span>
          {w.notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => w.notify("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {w.busy && (
        <div className="busy-indicator" role="status">
          <Loader2 className="spin" size={15} />
          {w.busy}
        </div>
      )}
      {inspected && (
        <Inspector asset={inspected} onClose={() => setInspected(undefined)} />
      )}
    </div>
  );
}
