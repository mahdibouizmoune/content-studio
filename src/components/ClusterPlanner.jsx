import { AlertTriangle, ArrowRight, Check, ExternalLink, FolderTree, Link2, LoaderCircle, Plus, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import WebsitePerformance from "@/components/WebsitePerformance";
import { Button, EmptyState, Field, inputClass } from "@/components/ui";
import { electronAPI } from "@/lib/electron";
import { buildClusterPlan, detectCannibalization } from "@/lib/contentPlanning";
import { buildSmartArticleDefaults } from "@/lib/smartContentEngine";
import { resolveArticleGenerationSettings } from "@/lib/articleGenerationSettings.mjs";
import { buildInterestProfile } from "@/lib/pinterestInterestIntelligence.mjs";

export default function ClusterPlanner({ articles, settings, refreshArticles, setActiveScreen, setArticlesWorkflowStage }) {
  const [seedTopic, setSeedTopic] = useState("");
  const [count, setCount] = useState(10);
  const [plan, setPlan] = useState([]);
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [maxClusters, setMaxClusters] = useState(6);
  const [pinterestPlan, setPinterestPlan] = useState(null);
  const [selectedClusterIds, setSelectedClusterIds] = useState(() => new Set());
  const [clusterWorking, setClusterWorking] = useState(false);
  const completedAndQueued = useMemo(() => articles || [], [articles]);
  const interestProfiles = useMemo(() => new Map(plan.map((item) => [item.id, buildInterestProfile({
    title: item.title,
    targetKeyword: item.targetKeyword,
    description: item.angle,
    cluster: seedTopic
  })])), [plan, seedTopic]);

  const warnings = useMemo(() => {
    return plan.map((item) => ({
      id: item.id,
      matches: detectCannibalization(item.title, completedAndQueued, { threshold: 58 })
    })).filter((item) => item.matches.length);
  }, [plan, completedAndQueued]);

  useEffect(() => {
    let active = true;
    electronAPI.getPinterestClusterWorkspace?.().then((result) => {
      if (!active || !result?.success || !result.history?.length) return;
      const latest = result.history[0];
      setPinterestPlan(latest);
      setSourceUrl(latest.source?.requestedUrl || latest.source?.destinationUrl || "");
      setSelectedClusterIds(new Set((latest.clusters || []).map((cluster) => cluster.id)));
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  async function buildPinterestClusters() {
    let parsed;
    try {
      parsed = new URL(sourceUrl.trim());
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch {
      setStatus("Enter the original recipe website URL.");
      return;
    }
    const jobKey = `pinterest-clusters-${Date.now()}`;
    setClusterWorking(true);
    setStatus("Inspecting the source and building Pinterest interest clusters...");
    try {
      const result = await electronAPI.buildPinterestClusters({
        url: parsed.href,
        maxClusters,
        settings,
        jobKey
      });
      if (!result?.success) throw new Error(result?.error || "Pinterest cluster planning failed.");
      setPinterestPlan(result.plan);
      setSelectedClusterIds(new Set((result.plan.clusters || []).map((cluster) => cluster.id)));
      setStatus(result.warning || `Built ${result.plan.clusters.length} distinct Pinterest interest clusters.`);
    } catch (error) {
      setStatus(error.message || "Pinterest cluster planning failed.");
    } finally {
      setClusterWorking(false);
    }
  }

  function togglePinterestCluster(clusterId) {
    setSelectedClusterIds((current) => {
      const next = new Set(current);
      if (next.has(clusterId)) next.delete(clusterId);
      else next.add(clusterId);
      return next;
    });
  }

  async function sendClustersToPinterest() {
    const selected = (pinterestPlan?.clusters || []).filter((cluster) => selectedClusterIds.has(cluster.id));
    if (!selected.length) {
      setStatus("Select at least one interest cluster first.");
      return;
    }
    const source = pinterestPlan.source || {};
    const destinationUrl = source.destinationUrl || source.canonicalUrl || source.requestedUrl;
    if (!/^https?:\/\//i.test(destinationUrl || "")) {
      setStatus("This plan needs a public destination URL before it can move to Pinterest.");
      return;
    }
    try {
      const hostname = new URL(destinationUrl).hostname.toLowerCase();
      if (source.sourceType === "pinterest-pin" && (hostname.includes("pinterest.") || hostname === "pin.it")) {
        setStatus("Pinterest did not expose this Pin's destination. Paste the original article link to create traffic-driving Pins.");
        return;
      }
    } catch {
      setStatus("This plan needs a valid public destination URL before it can move to Pinterest.");
      return;
    }
    setClusterWorking(true);
    try {
      const queueItems = selected.map((cluster) => {
        const idea = cluster.pinIdeas?.[0] || {};
        const image = source.imageUrl ? [{
          id: "source-image",
          kind: "article-featured",
          publicUrl: source.imageUrl,
          localPath: "",
          localUrl: "",
          aspectRatio: "",
          altText: source.title || pinterestPlan.topic,
          prompt: idea.visualDirection || ""
        }] : [];
        return {
          url: destinationUrl,
          title: idea.title || source.title || pinterestPlan.topic,
          excerpt: source.description || idea.hook || "",
          targetKeyword: cluster.keywords?.[0] || pinterestPlan.topic,
          queueType: "interest-cluster",
          clusterVariantId: `${pinterestPlan.id}:${cluster.id}`,
          smartPinStyle: "custom-modern-recipe-magazine",
          csvBoard: cluster.board || "",
          interestProfile: {
            primary: { id: cluster.id, label: cluster.label, confidence: Math.max(40, cluster.boardConfidence || 60) },
            dimensions: { core: pinterestPlan.topic, goals: [], method: "", occasion: cluster.audienceIntent || "" },
            lifecycle: { stage: cluster.lifecycle, confidence: "medium", basis: cluster.rationale },
            adjacent: (pinterestPlan.clusters || []).filter((item) => item.id !== cluster.id).map((item) => item.label).slice(0, 4),
            relatedTopics: cluster.keywords || [],
            source: "content-studio-url-cluster-planner"
          },
          relatedTopics: cluster.keywords || [],
          interests: cluster.keywords || [],
          sourceSnapshot: {
            version: 1,
            capturedAt: new Date().toISOString(),
            articleId: "",
            canonicalUrl: destinationUrl,
            title: source.title || pinterestPlan.topic,
            excerpt: source.description || "",
            targetKeyword: cluster.keywords?.[0] || pinterestPlan.topic,
            secondaryKeywords: (cluster.keywords || []).slice(1),
            recipe: {},
            images: image,
            preferredPortraitImageId: image[0]?.id || ""
          },
          addedAt: new Date().toISOString()
        };
      });
      const result = await electronAPI.appendPinQueue(queueItems);
      if (!result?.success) throw new Error(result?.error || "Could not send clusters to Pinterest.");
      setStatus(`Sent ${selected.length} distinct cluster variant${selected.length === 1 ? "" : "s"} to Pinterest.`);
      setActiveScreen("pin-creator");
    } catch (error) {
      setStatus(error.message || "Could not send clusters to Pinterest.");
    } finally {
      setClusterWorking(false);
    }
  }

  function generatePlan() {
    const next = buildClusterPlan(seedTopic, settings, count);
    setPlan(next);
    setStatus(`Built ${next.length} article idea${next.length === 1 ? "" : "s"} for this cluster.`);
  }

  async function addClusterToQueue() {
    if (!plan.length) return;
    setWorking(true);
    try {
      const now = Date.now();
      const clusterId = `cluster-${now}`;
      const drafts = [];
      for (const [index, item] of plan.entries()) {
        const interestProfile = interestProfiles.get(item.id) || buildInterestProfile(item);
        const articleDraft = {
          type: "article",
          seoBrief: {
            targetKeyword: item.targetKeyword,
            secondaryKeywords: item.secondaryKeywords,
            searchIntent: item.intent,
            audience: item.audience,
            competitorNotes: item.notes
          }
        };
        const smart = buildSmartArticleDefaults({
          title: item.title,
          mode: "article",
          settings,
          manual: articleDraft.seoBrief
        });
        const resolved = resolveArticleGenerationSettings({
          article: articleDraft,
          smartRecommendations: smart,
          globalSettings: settings
        });
        drafts.push({
          id: `${clusterId}-${index}`,
          title: item.title,
          generatedTitle: null,
          content: "",
          type: "article",
          category: "default",
          workflowStatus: "queued",
          clusterId,
          clusterRole: item.role,
          clusterPillarTitle: plan[0]?.title || item.title,
          clusterInternalTargets: item.internalLinkTargets,
          interestProfile,
          pinterestRelatedTopics: interestProfile.relatedTopics,
          articleLength: resolved.articleLength,
          articleLengthSource: resolved.articleLengthSource,
          brandVoiceId: resolved.brandVoiceId,
          recipeCardEnabled: resolved.recipeCardEnabled,
          requireOutlineApproval: resolved.requireOutlineApproval,
          outlineApproved: resolved.outlineApproved,
          outline: "",
          seoBrief: resolved.seoBrief,
          metaTitle: "",
          metaDescription: "",
          slug: "",
          excerpt: "",
          tags: [],
          seoScore: null,
          seoChecks: [],
          publishHistory: [],
          featuredImageAlt: "",
          featuredImage: "",
          featuredImageLocalPath: "",
          featuredImagePrompt: "",
          images: [],
          queueStatus: "pending",
          errorMessage: "",
          createdAt: new Date(now + index).toISOString()
        });
      }
      const intake = await electronAPI.queueArticles({ articles: drafts });
      if (!intake?.success) throw new Error(intake?.error || 'Could not queue cluster articles.');
      await refreshArticles();
      setStatus(`Added ${intake.addedCount} cluster articles. Skipped ${intake.skipped?.length || 0} overlapping ideas.`);
      if (!intake.addedCount) return;
      setArticlesWorkflowStage?.("queued");
      setActiveScreen("articles");
    } catch (error) {
      setStatus(error.message || "Could not add cluster to queue.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="animate-fade-in">
      <SectionHeader eyebrow="Planning" title="Content Cluster Planner">
        Build specific Pinterest use cases with pillar articles, support posts, adjacent interests, SEO briefs, and internal-link targets.
      </SectionHeader>

      <WebsitePerformance actionLabel="Plan Clusters" onChoose={(item) => { setSourceUrl(item.url); setSeedTopic(item.topic || item.title); setStatus(`Selected ${item.title}. Build the source-based cluster plan below.`); }} onSettings={() => setActiveScreen('settings')} />

      <div className="mb-8 border-b border-slate-200 pb-8">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase text-violet-600"><FolderTree className="h-4 w-4" />Pinterest URL Clusters</div>
            <h3 className="mt-1 text-2xl font-black text-slate-950">Plan Distinct Pin Use Cases</h3>
          </div>
          {pinterestPlan ? <div className="text-sm font-bold text-slate-500">{pinterestPlan.clusters?.length || 0} coherent clusters</div> : null}
        </div>

        <div className="soft-card rounded-lg p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_160px_auto] lg:items-end">
            <Field label="Original recipe article link">
              <div className="relative">
                <Link2 className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  className={`${inputClass} pl-12`}
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter" && !clusterWorking) buildPinterestClusters(); }}
                  placeholder="https://yourblog.com/recipe/"
                />
              </div>
            </Field>
            <Field label="Maximum clusters">
              <select className={inputClass} value={maxClusters} onChange={(event) => setMaxClusters(Number(event.target.value))}>
                {[3, 4, 5, 6, 7, 8, 9, 10].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </Field>
            <Button onClick={buildPinterestClusters} disabled={clusterWorking || !sourceUrl.trim()}>
              {clusterWorking ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Build Cluster Plan
            </Button>
          </div>
        </div>

        {pinterestPlan ? (
          <div className="mt-5 space-y-4">
            <div className="soft-card overflow-hidden rounded-lg">
              <div className="grid gap-0 md:grid-cols-[180px_minmax(0,1fr)]">
                {pinterestPlan.source?.imageUrl ? (
                  <img className="h-48 w-full object-cover md:h-full" src={pinterestPlan.source.imageUrl} alt="" />
                ) : (
                  <div className="flex min-h-36 items-center justify-center bg-violet-50 text-violet-500"><FolderTree className="h-10 w-10" /></div>
                )}
                <div className="min-w-0 p-5">
                  <div className="text-xs font-black uppercase text-violet-600">Primary use case</div>
                  <h3 className="mt-1 text-xl font-black text-slate-950">{pinterestPlan.primaryUseCase}</h3>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{pinterestPlan.summary}</p>
                  <div className="mt-3 flex min-w-0 items-center gap-2 text-sm font-bold text-slate-500">
                    <ExternalLink className="h-4 w-4 shrink-0" />
                    <span className="truncate">{pinterestPlan.source?.destinationUrl || pinterestPlan.source?.canonicalUrl}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {(pinterestPlan.strategyNotes || []).slice(0, 4).map((note) => (
                  <span key={note} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">{note}</span>
                ))}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="ghost" onClick={() => setSelectedClusterIds(new Set((pinterestPlan.clusters || []).map((cluster) => cluster.id)))}>Select All</Button>
                <Button variant="ghost" onClick={() => setSelectedClusterIds(new Set())}>Clear</Button>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {(pinterestPlan.clusters || []).map((cluster, index) => {
                const selected = selectedClusterIds.has(cluster.id);
                const idea = cluster.pinIdeas?.[0] || {};
                const lifecycleClasses = cluster.lifecycle === "growing"
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                  : cluster.lifecycle === "emerging"
                    ? "bg-violet-50 text-violet-700 ring-violet-100"
                    : cluster.lifecycle === "fading"
                      ? "bg-slate-100 text-slate-600 ring-slate-200"
                      : "bg-indigo-50 text-indigo-700 ring-indigo-100";
                return (
                  <article key={cluster.id} className={`soft-card rounded-lg p-5 transition-colors ${selected ? "ring-2 ring-violet-400" : ""}`}>
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        aria-label={`${selected ? "Remove" : "Select"} ${cluster.label}`}
                        onClick={() => togglePinterestCluster(cluster.id)}
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border transition-colors ${selected ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300 bg-white text-transparent"}`}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-black uppercase text-slate-400">{index + 1}. {cluster.role.replace(/-/g, " ")}</span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-black capitalize ring-1 ${lifecycleClasses}`}>{cluster.lifecycle}</span>
                        </div>
                        <h4 className="mt-2 text-lg font-black leading-tight text-slate-950">{cluster.label}</h4>
                        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{cluster.rationale}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-md bg-slate-50 p-3 ring-1 ring-slate-100">
                        <div className="text-xs font-black uppercase text-slate-500">Pinner intent</div>
                        <p className="mt-1 text-sm font-semibold text-slate-700">{cluster.audienceIntent}</p>
                      </div>
                      <div className="rounded-md bg-violet-50 p-3 ring-1 ring-violet-100">
                        <div className="text-xs font-black uppercase text-violet-600">Best board</div>
                        <p className="mt-1 text-sm font-black text-violet-900">{cluster.board || "Choose after generation"}</p>
                        <p className="mt-1 text-xs font-bold text-violet-600">{cluster.boardConfidence || 0}% match</p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="text-xs font-black uppercase text-slate-500">First Pin angle</div>
                      <p className="mt-1 text-sm font-black text-slate-900">{idea.title}</p>
                      <p className="mt-1 text-sm font-medium text-slate-600">Overlay: {idea.overlayText}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(cluster.keywords || []).slice(0, 7).map((keyword) => <span key={keyword} className="rounded bg-white px-2 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">{keyword}</span>)}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="flex justify-end">
              <Button onClick={sendClustersToPinterest} disabled={clusterWorking || !selectedClusterIds.size}>
                Send {selectedClusterIds.size || "Selected"} To Pinterest <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mb-4">
        <div className="text-xs font-black uppercase text-indigo-600">Article cluster planning</div>
        <h3 className="mt-1 text-2xl font-black text-slate-950">Build Supporting Articles</h3>
      </div>

      <div className="mb-5 grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="soft-card rounded-lg p-5">
          <div className="grid gap-4 md:grid-cols-[1fr_160px]">
            <Field label="Cluster topic">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input className={`${inputClass} pl-12`} value={seedTopic} onChange={(event) => setSeedTopic(event.target.value)} placeholder="High protein chicken dinners" />
              </div>
            </Field>
            <Field label="Ideas">
              <input type="number" min="1" max="30" className={inputClass} value={count} onChange={(event) => setCount(Number(event.target.value || 10))} />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={generatePlan}><Sparkles className="h-4 w-4" />Build {count}-Post Cluster</Button>
            <Button variant="secondary" onClick={addClusterToQueue} disabled={working || !plan.length}><Plus className="h-4 w-4" />Add Cluster To Queue</Button>
          </div>
          {status ? <div className="mt-4 rounded-md bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700 ring-1 ring-violet-100">{status}</div> : null}
        </div>

        <div className="soft-card rounded-lg p-5">
          <div className="text-lg font-black text-slate-900">Duplicate Check</div>
          <p className="mt-1 text-sm font-semibold text-slate-500">Flags titles that may compete with existing queued or completed articles.</p>
          <div className="mt-4 space-y-2">
            {!warnings.length ? (
              <div className="rounded-md bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700">No overlap found for this plan.</div>
            ) : warnings.map((warning) => {
              const idea = plan.find((item) => item.id === warning.id);
              return (
                <div key={warning.id} className="rounded-md bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-100">
                  <div className="flex gap-2 font-black"><AlertTriangle className="h-4 w-4 shrink-0" />{idea?.title}</div>
                  <div className="mt-1 font-semibold">{warning.matches[0].score}% similar to {warning.matches[0].article.generatedTitle || warning.matches[0].article.title}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {!plan.length ? (
        <EmptyState title="No cluster yet">Enter a recipe topic and build a cluster to preview the planned articles.</EmptyState>
      ) : (
        <div className="grid gap-4">
          <div className="soft-card rounded-lg p-5">
            <div className="text-xs font-black uppercase text-indigo-600">Interest Cluster Map</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[...new Map([...interestProfiles.values()].map((profile) => [profile.primary.id, profile])).values()].map((profile) => (
                <span key={profile.primary.id} className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700 ring-1 ring-violet-100">{profile.primary.label}</span>
              ))}
            </div>
          </div>
          {plan.map((item, index) => (
            <article key={item.id} className="soft-card rounded-lg p-5">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-black uppercase text-indigo-600">{index + 1}. {item.role}</div>
                  <h2 className="mt-1 text-xl font-black leading-tight text-slate-900">{item.title}</h2>
                </div>
                <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">{item.intent}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md bg-white p-3 ring-1 ring-slate-200">
                  <div className="text-xs font-black uppercase text-slate-500">Keywords</div>
                  <p className="mt-1 text-sm font-semibold text-slate-700">{item.secondaryKeywords}</p>
                </div>
                <div className="rounded-md bg-white p-3 ring-1 ring-slate-200">
                  <div className="flex items-center gap-2 text-xs font-black uppercase text-slate-500"><Link2 className="h-4 w-4" />Internal Links</div>
                  <p className="mt-1 text-sm font-semibold text-slate-700">{item.internalLinkTargets.join(", ")}</p>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-md bg-violet-50 p-3 ring-1 ring-violet-100">
                  <div className="text-xs font-black uppercase text-violet-700">Pinterest Use Case</div>
                  <p className="mt-1 text-sm font-black text-violet-900">{interestProfiles.get(item.id)?.primary.label}</p>
                  <p className="mt-1 text-xs font-semibold capitalize text-violet-600">{interestProfiles.get(item.id)?.lifecycle.stage} / {interestProfiles.get(item.id)?.primary.confidence}% confidence</p>
                </div>
                <div className="rounded-md bg-slate-50 p-3 ring-1 ring-slate-100">
                  <div className="text-xs font-black uppercase text-slate-600">Adjacent Opportunities</div>
                  <p className="mt-1 text-sm font-semibold text-slate-700">{interestProfiles.get(item.id)?.adjacent.join(", ")}</p>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm font-medium leading-6 text-slate-600">{item.notes}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
