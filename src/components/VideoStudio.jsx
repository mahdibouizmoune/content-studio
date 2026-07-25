import { ExternalLink, Film, Play, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import { Button, EmptyState, Field, inputClass } from "@/components/ui";
import { electronAPI } from "@/lib/electron";

const promptPresets = [
  {
    name: "Recipe Closeup",
    prompt: "Cinematic close-up food video of a finished recipe on a kitchen table, gentle steam rising, sauce glistening, slow push-in camera movement, warm natural window light, appetizing texture, realistic motion, no text overlay"
  },
  {
    name: "Ingredient Motion",
    prompt: "Fresh ingredients being arranged around a finished recipe, slow overhead camera movement, hands placing herbs and garnish, bright clean kitchen lighting, natural realistic motion, food blog style, no text overlay"
  },
  {
    name: "Pinterest Hook",
    prompt: "Vertical social video of a delicious homemade recipe, fork pulling through the first bite, slow motion texture reveal, cozy kitchen background, warm lighting, save-worthy food content, no text overlay"
  }
];

const videoModels = [
  {
    id: "pruna-p-video",
    name: "Pruna P-Video",
    badge: "Default",
    price: "720p $0.02/sec, 1080p $0.04/sec, draft 4x cheaper",
    bestFor: "Fast recipe/social tests with draft mode",
    durations: ["5", "8", "10", "15", "20"],
    resolutions: ["720p", "1080p"],
    fpsOptions: ["24", "48"],
    supportsDraft: true,
    supportsFps: true,
    supportsAspect: true,
    supportsSeed: true
  },
  {
    id: "seedance-1-lite",
    name: "Seedance 1 Lite",
    price: "est. ~$0.08 5s 480p, ~$0.18 5s 720p",
    bestFor: "Budget food motion and vertical clips",
    durations: ["5", "8", "10", "12"],
    resolutions: ["720p", "480p"],
    fpsOptions: ["24", "30"],
    supportsDraft: false,
    supportsFps: true,
    supportsAspect: true,
    supportsSeed: true
  },
  {
    id: "seedance-1-pro-fast",
    name: "Seedance 1 Pro Fast",
    price: "faster, ~60% lower compute than Pro",
    bestFor: "Better quality while staying efficient",
    durations: ["5", "8", "10", "12"],
    resolutions: ["480p", "1080p"],
    fpsOptions: ["24", "30"],
    supportsDraft: false,
    supportsFps: true,
    supportsAspect: true,
    supportsSeed: true
  },
  {
    id: "seedance-1-pro",
    name: "Seedance 1 Pro",
    price: "higher quality, higher cost than Pro Fast",
    bestFor: "Premium hero clips and polished motion",
    durations: ["5", "8", "10", "12"],
    resolutions: ["480p", "1080p"],
    fpsOptions: ["24", "30"],
    supportsDraft: false,
    supportsFps: true,
    supportsAspect: true,
    supportsSeed: true
  },
  {
    id: "hailuo-02",
    name: "MiniMax Hailuo 02",
    price: "est. ~$0.45/generation",
    bestFor: "Cinematic 6s or 10s clips",
    durations: ["6", "10"],
    resolutions: ["768p", "1080p"],
    fpsOptions: ["24"],
    supportsDraft: false,
    supportsFps: false,
    supportsAspect: false,
    supportsSeed: false
  }
];

function formatDate(value) {
  try { return new Date(value).toLocaleString(); } catch { return ""; }
}

export default function VideoStudio({ settings }) {
  const [model, setModel] = useState("pruna-p-video");
  const [prompt, setPrompt] = useState(promptPresets[0].prompt);
  const [image, setImage] = useState("");
  const [duration, setDuration] = useState("5");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [resolution, setResolution] = useState("720p");
  const [fps, setFps] = useState("24");
  const [draft, setDraft] = useState(true);
  const [promptUpsampling, setPromptUpsampling] = useState(true);
  const [seed, setSeed] = useState("");
  const [videos, setVideos] = useState([]);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(null);
  const [activeJobKey, setActiveJobKey] = useState("");

  useEffect(() => {
    electronAPI.getGeneratedVideos?.()
      .then((result) => {
        if (result?.success) setVideos(result.videos || []);
      })
      .catch((error) => setStatus(error.message || "Could not load generated videos."));
  }, []);

  useEffect(() => {
    return electronAPI.onVideoProgress?.((event) => {
      setProgress(event);
      setStatus(`Video generation ${event.status} (${event.attempt}/${event.maxAttempts})`);
    });
  }, []);

  const latest = videos[0];
  const canGenerate = useMemo(() => prompt.trim().length >= 12 && !working, [prompt, working]);
  const selectedModel = videoModels.find((item) => item.id === model) || videoModels[0];

  useEffect(() => {
    if (!selectedModel.durations.includes(duration)) setDuration(selectedModel.durations[0]);
    if (!selectedModel.resolutions.includes(resolution)) setResolution(selectedModel.resolutions[0]);
    if (!selectedModel.fpsOptions.includes(fps)) setFps(selectedModel.fpsOptions[0]);
    if (selectedModel.id === "hailuo-02" && duration === "10" && resolution === "1080p") setResolution("768p");
  }, [selectedModel, duration, resolution, fps]);

  async function generateVideo() {
    if (!prompt.trim()) {
      setStatus("Enter a video prompt first.");
      return;
    }
    setWorking(true);
    setProgress(null);
    setStatus("Starting Pruna P-Video generation...");
    const jobKey = `video-${Date.now()}`;
    setActiveJobKey(jobKey);
    try {
      const result = await electronAPI.generateVideo?.({
        model,
        prompt,
        image,
        duration: Number(duration),
        aspectRatio,
        resolution,
        fps: Number(fps),
        draft,
        promptUpsampling,
        seed,
        settings,
        jobKey
      });
      if (result?.success) {
        setVideos(result.videos || (result.video ? [result.video, ...videos] : videos));
        setStatus("Video generated and saved locally.");
      } else {
        setStatus(result?.error || "Video generation failed.");
      }
    } catch (error) {
      setStatus(error.message || "Video generation failed.");
    } finally {
      setWorking(false);
      setProgress(null);
      setActiveJobKey("");
    }
  }

  async function cancelVideo() {
    if (activeJobKey) await electronAPI.cancelJob?.(activeJobKey);
    setWorking(false);
    setStatus("Cancel requested.");
  }

  async function deleteVideo(videoId) {
    if (!window.confirm("Delete this generated video from local storage?")) return;
    const result = await electronAPI.deleteGeneratedVideo?.(videoId);
    if (result?.success) {
      setVideos(result.videos || []);
      setStatus("Video deleted.");
    }
  }

  return (
    <section className="animate-fade-in">
      <SectionHeader eyebrow="Video" title="Video Studio">
        Generate short recipe and social videos with Pruna P-Video on Replicate. Use image-to-video when you want motion from an existing pin or article image.
      </SectionHeader>

      <div className="mb-5 grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="soft-card rounded-lg p-4">
          <Field label="Video model" hint="Pruna stays the default. Pricing is shown up front so you can pick speed, quality, or budget before generating.">
            <div className="grid gap-2 md:grid-cols-2">
              {videoModels.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setModel(option.id)}
                  className={`rounded-md border p-3 text-left transition ${
                    model === option.id ? "border-violet-500 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 bg-white hover:border-violet-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-black text-slate-900">{option.name}</div>
                    {option.badge ? <span className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-2 py-0.5 text-[10px] font-black uppercase text-white">{option.badge}</span> : null}
                  </div>
                  <div className="mt-1 text-xs font-black text-violet-700">{option.price}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">{option.bestFor}</div>
                </button>
              ))}
            </div>
          </Field>

          <div className="my-5 h-px bg-slate-100" />

          <Field label="Video prompt" hint="Best results: subject, motion, scene, camera movement, lighting, style. Avoid asking for text overlays.">
            <textarea className={`${inputClass} min-h-44 resize-y leading-6`} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </Field>

          <div className="mt-4 flex flex-wrap gap-2">
            {promptPresets.map((preset) => (
              <Button key={preset.name} variant="secondary" className="h-9 px-3" onClick={() => setPrompt(preset.prompt)}>
                <Sparkles className="h-4 w-4" />{preset.name}
              </Button>
            ))}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Optional starting image URL" hint="Paste a public image URL from ImgBB, WordPress, or Replicate for image-to-video. Leave empty for text-to-video.">
              <input className={inputClass} value={image} onChange={(event) => setImage(event.target.value)} placeholder="https://..." />
            </Field>
            <Field label="Seed">
              <input className={inputClass} value={seed} onChange={(event) => setSeed(event.target.value)} placeholder={selectedModel.supportsSeed ? "Optional" : "Not used by this model"} disabled={!selectedModel.supportsSeed} />
            </Field>
          </div>
        </div>

        <div className="soft-card rounded-lg p-4">
          <div className="grid gap-3">
            <div className="rounded-md bg-violet-50 p-3 text-sm font-bold text-violet-800 ring-1 ring-violet-100">
              {selectedModel.name}: {selectedModel.price}
            </div>
            <Field label="Duration">
              <select className={inputClass} value={duration} onChange={(event) => setDuration(event.target.value)}>
                {selectedModel.durations.map((value) => <option key={value} value={value}>{value} seconds</option>)}
              </select>
            </Field>
            <Field label="Aspect ratio" hint={selectedModel.supportsAspect ? "" : "This model uses the image or model default framing."}>
              <select className={inputClass} value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)} disabled={Boolean(image.trim()) || !selectedModel.supportsAspect}>
                <option value="9:16">9:16 Vertical</option>
                <option value="16:9">16:9 Landscape</option>
                <option value="1:1">1:1 Square</option>
                <option value="3:4">3:4 Portrait</option>
                <option value="4:3">4:3 Landscape</option>
                <option value="2:3">2:3 Portrait</option>
                <option value="3:2">3:2 Landscape</option>
              </select>
            </Field>
            <Field label="Resolution">
              <select className={inputClass} value={resolution} onChange={(event) => setResolution(event.target.value)}>
                {selectedModel.resolutions.map((value) => <option key={value} value={value}>{value}{value === "480p" ? " faster preview" : ""}</option>)}
              </select>
            </Field>
            <Field label="FPS" hint={selectedModel.supportsFps ? "" : "This model uses its default frame rate."}>
              <select className={inputClass} value={fps} onChange={(event) => setFps(event.target.value)} disabled={!selectedModel.supportsFps}>
                {selectedModel.fpsOptions.map((value) => <option key={value} value={value}>{value} fps</option>)}
              </select>
            </Field>
            <label className="flex items-center justify-between gap-3 rounded-md bg-white p-3 text-sm font-bold text-slate-700 ring-1 ring-slate-200">
              <span>Draft mode</span>
              <input type="checkbox" className="h-5 w-5" checked={draft} disabled={!selectedModel.supportsDraft} onChange={(event) => setDraft(event.target.checked)} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-md bg-white p-3 text-sm font-bold text-slate-700 ring-1 ring-slate-200">
              <span>Prompt upsampling</span>
              <input type="checkbox" className="h-5 w-5" checked={promptUpsampling} onChange={(event) => setPromptUpsampling(event.target.checked)} />
            </label>
          </div>

          <div className="mt-4 grid gap-2">
            <Button onClick={generateVideo} disabled={!canGenerate}><Play className="h-4 w-4" />{working ? "Generating..." : "Generate Video"}</Button>
            <Button variant="secondary" onClick={cancelVideo} disabled={!working}>Cancel</Button>
            <Button variant="secondary" onClick={() => electronAPI.getGeneratedVideos?.().then((result) => result?.success && setVideos(result.videos || []))}>
              <RefreshCw className="h-4 w-4" />Refresh
            </Button>
          </div>

          {status ? <div className="mt-4 rounded-md bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700 ring-1 ring-violet-100">{status}</div> : null}
          {working || progress ? (
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-violet-100">
              <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600 transition-all" style={{ width: `${progress ? Math.min(96, Math.max(8, Math.round((progress.attempt / progress.maxAttempts) * 100))) : 8}%` }} />
            </div>
          ) : null}
        </div>
      </div>

      {latest?.displayUrl ? (
        <div className="mb-5 soft-card rounded-lg p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900">Latest Video</h3>
              <p className="mt-1 text-sm font-semibold text-slate-500">{latest.modelLabel || latest.model} / {latest.duration}s / {latest.resolution}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {latest.localPath ? <Button variant="secondary" onClick={() => electronAPI.openPath(latest.localPath)}><ExternalLink className="h-4 w-4" />Open File</Button> : null}
              {latest.remoteVideoUrl ? <Button variant="secondary" onClick={() => electronAPI.openExternalUrl(latest.remoteVideoUrl)}><ExternalLink className="h-4 w-4" />Remote</Button> : null}
            </div>
          </div>
          <video src={latest.displayUrl} controls className="max-h-[640px] w-full rounded-lg bg-slate-950" />
        </div>
      ) : null}

      {!videos.length ? (
        <EmptyState title="No videos yet">Generate a draft first, then rerun with draft mode off when the motion looks right.</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {videos.map((video) => (
            <article key={video.id} className="soft-card rounded-lg p-4">
              {video.displayUrl ? (
                <video src={video.displayUrl} controls className="aspect-video w-full rounded-md bg-slate-950 object-contain" />
              ) : (
                <div className="grid aspect-video place-items-center rounded-md bg-slate-100 text-slate-400"><Film className="h-8 w-8" /></div>
              )}
              <div className="mt-3 text-xs font-black uppercase text-indigo-600">{video.modelLabel || video.model || "prunaai/p-video"}</div>
              <h3 className="mt-1 line-clamp-2 text-base font-black text-slate-900">{video.prompt}</h3>
              <div className="mt-2 text-sm font-semibold text-slate-500">{formatDate(video.createdAt)} / {video.duration}s / {video.resolution}</div>
              {video.priceLabel ? <div className="mt-1 text-xs font-bold text-violet-700">{video.priceLabel}</div> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {video.localPath ? <Button variant="secondary" className="h-9 px-3" onClick={() => electronAPI.openPath(video.localPath)}><ExternalLink className="h-4 w-4" />Open</Button> : null}
                <Button variant="danger" className="h-9 px-3" onClick={() => deleteVideo(video.id)}><Trash2 className="h-4 w-4" />Delete</Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
