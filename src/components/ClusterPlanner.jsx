import { AlertTriangle, Link2, Plus, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { Button, EmptyState, Field, inputClass } from "@/components/ui";
import { electronAPI } from "@/lib/electron";
import { buildClusterPlan, detectCannibalization } from "@/lib/contentPlanning";
import { buildSmartArticleDefaults } from "@/lib/smartContentEngine";
import { resolveArticleGenerationSettings } from "@/lib/articleGenerationSettings.mjs";

export default function ClusterPlanner({ articles, settings, refreshArticles, setActiveScreen, setArticlesWorkflowStage }) {
  const confirmAction = useConfirmDialog();
  const [seedTopic, setSeedTopic] = useState("");
  const [count, setCount] = useState(10);
  const [plan, setPlan] = useState([]);
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const completedAndQueued = useMemo(() => articles || [], [articles]);

  const warnings = useMemo(() => {
    return plan.map((item) => ({
      id: item.id,
      matches: detectCannibalization(item.title, completedAndQueued, { threshold: 58 })
    })).filter((item) => item.matches.length);
  }, [plan, completedAndQueued]);

  function generatePlan() {
    const next = buildClusterPlan(seedTopic, settings, count);
    setPlan(next);
    setStatus(`Built ${next.length} article idea${next.length === 1 ? "" : "s"} for this cluster.`);
  }

  async function addClusterToQueue() {
    if (!plan.length) return;
    if (warnings.length && !await confirmAction({
      title: "Possible content overlap",
      message: `${warnings.length} article idea${warnings.length === 1 ? "" : "s"} may overlap existing content.`,
      confirmLabel: "Add Anyway"
    })) return;
    setWorking(true);
    try {
      const now = Date.now();
      const clusterId = `cluster-${now}`;
      for (const [index, item] of plan.entries()) {
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
        await electronAPI.saveArticle({
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
      await refreshArticles();
      setStatus(`Added ${plan.length} cluster article${plan.length === 1 ? "" : "s"} to the queue.`);
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
        Start from one recipe topic, then build a 10-post cluster with pillar, support posts, SEO briefs, and internal-link targets.
      </SectionHeader>

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
            <Button onClick={generatePlan}><Sparkles className="h-4 w-4" />Build 10-Post Cluster</Button>
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
              <p className="mt-3 whitespace-pre-line text-sm font-medium leading-6 text-slate-600">{item.notes}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
