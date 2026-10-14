import { Film, Play, Square, Upload, Video, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Select, toast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useUsers } from "@/lib/data";
import { BACKEND_URL, auth } from "@/lib/firebase";

type Health = { ok: boolean; models: Record<string, string[]>; faces: string[] };
type Job = { status: "queued" | "running" | "done" | "error"; progress: number; message: string; frames?: number; elapsed?: number; detections?: number };

const MODELS = [
  { id: "all", label: "All models", hint: "Weapon + violence + face" },
  { id: "weapon", label: "Guns", hint: "Firearm detection" },
  { id: "weapon1", label: "All weapons", hint: "Gun, knife, grenade" },
  { id: "violence", label: "Violence", hint: "Fight detection" },
  { id: "face", label: "Faces", hint: "Known vs stranger" },
];

async function api(path: string, init: RequestInit = {}) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${BACKEND_URL}${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export default function AiLab() {
  const users = useUsers();
  const homeowners = users.data.filter((u) => u.role !== "admin");
  const [health, setHealth] = useState<Health | null | "down">(null);
  const [target, setTarget] = useState("");
  const [model, setModel] = useState("all");
  const [conf, setConf] = useState(40);
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [webcam, setWebcam] = useState(false);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const frameTimer = useRef<number>(0);

  const checkHealth = useCallback(() => {
    setHealth(null);
    fetch(`${BACKEND_URL}/api/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth("down"));
  }, []);
  useEffect(checkHealth, [checkHealth]);

  // Poll job progress.
  useEffect(() => {
    if (!jobId) return;
    const t = window.setInterval(async () => {
      try {
        const j: Job = await api(`/api/jobs/${jobId}`);
        setJob(j);
        if (j.status === "done") {
          window.clearInterval(t);
          const token = await auth.currentUser?.getIdToken();
          setOutputUrl(`${BACKEND_URL}/api/jobs/${jobId}/output?token=${token}`);
        } else if (j.status === "error") window.clearInterval(t);
      } catch {
        window.clearInterval(t);
      }
    }, 800);
    return () => window.clearInterval(t);
  }, [jobId]);

  // Refresh the webcam frame.
  useEffect(() => {
    if (!webcam) return;
    let alive = true;
    const tick = async () => {
      const token = await auth.currentUser?.getIdToken();
      if (alive) setFrameUrl(`${BACKEND_URL}/api/webcam/frame?token=${token}&t=${Date.now()}`);
    };
    void tick();
    frameTimer.current = window.setInterval(tick, 150);
    return () => {
      alive = false;
      window.clearInterval(frameTimer.current);
    };
  }, [webcam]);

  const run = async () => {
    if (!file || !target) return;
    const fd = new FormData();
    fd.append("video", file);
    fd.append("model", model);
    fd.append("conf", String(conf / 100));
    fd.append("userId", target);
    setOutputUrl(null);
    setJob({ status: "queued", progress: 0, message: "Uploading…" });
    try {
      const { job_id } = await api("/api/process", { method: "POST", body: fd });
      setJobId(job_id);
    } catch (e) {
      setJob(null);
      toast("Couldn't start analysis", { tone: "error", message: (e as Error).message });
    }
  };

  const startWebcam = async () => {
    if (!target) return toast("Choose a homeowner first", { tone: "error" });
    try {
      await api("/api/webcam/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: target }) });
      setWebcam(true);
    } catch (e) {
      toast("Couldn't start webcam", { tone: "error", message: (e as Error).message });
    }
  };
  const stopWebcam = async () => {
    await api("/api/webcam/stop", { method: "POST" }).catch(() => {});
    setWebcam(false);
    setFrameUrl(null);
  };

  const down = health === "down";
  const busy = job?.status === "queued" || job?.status === "running";

  return (
    <>
      <PageHeader
        title="AI Lab"
        description="Test the AI models with a video or the server's webcam. Detections are sent to the chosen homeowner's app."
        actions={
          <Badge tone={down ? "danger" : health ? "ok" : "neutral"} dot>
            {down ? "Backend offline" : health ? "Backend online" : "Checking…"}
          </Badge>
        }
      />

      {down ? (
        <Card>
          <EmptyState
            icon={WifiOff}
            title="AI backend isn't running"
            message={`Start it with “python app.py” in the backend folder, then retry. Expected at ${BACKEND_URL}.`}
            action={<Button variant="secondary" onClick={checkHealth}>Retry</Button>}
          />
        </Card>
      ) : (
        <>
          <Card className="mb-6 p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_2fr]">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-muted">Send detections to</span>
                <Select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full">
                  <option value="">Choose a homeowner…</option>
                  {homeowners.map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.fullName} — {u.email}
                    </option>
                  ))}
                </Select>
              </label>
              <div>
                <span className="mb-1.5 block text-sm font-medium text-muted">Model</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setModel(m.id)}
                      className={cn("rounded-lg border p-2.5 text-left", model === m.id ? "border-accent bg-accent/10" : "border-border hover:border-subtle")}
                    >
                      <p className="text-sm font-semibold">{m.label}</p>
                      <p className="text-[11px] text-muted">{m.hint}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {health && !down ? (
              <p className="mt-4 text-xs text-subtle">
                Known faces on server: {health.faces.length ? health.faces.join(", ") : "none (add photos to backend/faces/)"}
              </p>
            ) : null}
          </Card>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="Video analysis" description="Upload a clip; the annotated result plays here." />
              <div className="space-y-4 p-5">
                <label className="flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed border-border px-4 py-8 text-center hover:border-accent">
                  <Upload className="h-6 w-6 text-accent" />
                  <span className="mt-2 text-sm font-medium">{file ? file.name : "Choose a video"}</span>
                  <span className="text-xs text-subtle">{file ? `${(file.size / 1048576).toFixed(1)} MB` : "MP4, AVI or MOV"}</span>
                  <input type="file" accept="video/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </label>
                {model !== "face" ? (
                  <label className="block text-sm text-muted">
                    Confidence threshold: <span className="font-semibold text-accent">{conf}%</span>
                    <input type="range" min={10} max={90} value={conf} onChange={(e) => setConf(+e.target.value)} className="mt-2 w-full accent-[#22D3EE]" />
                  </label>
                ) : null}
                <Button className="w-full" icon={Play} disabled={!file || !target} loading={busy} onClick={run}>
                  {target ? "Run detection" : "Choose a homeowner first"}
                </Button>
                {job ? (
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-muted">
                      <span>{job.message}</span>
                      <span>{job.progress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface2">
                      <div className={cn("h-full transition-all", job.status === "error" ? "bg-danger" : "bg-accent")} style={{ width: `${job.progress}%` }} />
                    </div>
                    {job.status === "done" ? (
                      <p className="mt-2 text-xs text-muted">
                        {job.frames} frames in {job.elapsed}s · {job.detections ?? 0} alert(s) sent
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {outputUrl ? <video src={outputUrl} controls className="w-full rounded-lg border border-border bg-black" /> : null}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Live webcam"
                description="Runs all models on the server PC's webcam."
                actions={webcam ? <Badge tone="ok" dot>Live</Badge> : null}
              />
              <div className="space-y-4 p-5">
                <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-border bg-black">
                  {frameUrl ? <img src={frameUrl} alt="Webcam" className="h-full w-full object-contain" /> : <Video className="h-8 w-8 text-subtle" />}
                </div>
                {webcam ? (
                  <Button className="w-full" variant="danger" icon={Square} onClick={stopWebcam}>Stop webcam</Button>
                ) : (
                  <Button className="w-full" icon={Film} disabled={!target} onClick={startWebcam}>
                    {target ? "Start webcam" : "Choose a homeowner first"}
                  </Button>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

