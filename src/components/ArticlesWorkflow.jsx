import { AlertCircle, CheckCircle2, Clock3, FileText, Globe2, LayoutGrid, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import AddToQueue from "@/components/AddToQueue";
import ArticlesList from "@/components/ArticlesList";
import ModeSelector from "@/components/ModeSelector";
import Queue from "@/components/Queue";
import SectionHeader from "@/components/SectionHeader";
import { Button } from "@/components/ui";
import { isArticlePublished } from "@/lib/articlePublication.mjs";

const stages = [
  { id: "mode", label: "Mode", icon: LayoutGrid },
  { id: "add", label: "Add", icon: Plus },
  { id: "queued", label: "Queued", icon: Clock3 },
  { id: "completed", label: "Completed", icon: CheckCircle2 },
  { id: "published", label: "Published", icon: Globe2 },
  { id: "errors", label: "Errors", icon: AlertCircle }
];

export default function ArticlesWorkflow(props) {
  const { articles, articlesWorkflowStage, setArticlesWorkflowStage } = props;
  const [localStage, setLocalStage] = useState("mode");
  const stage = articlesWorkflowStage || localStage;
  const chooseStage = (nextStage) => {
    setLocalStage(nextStage);
    setArticlesWorkflowStage?.(nextStage);
  };
  const counts = useMemo(() => {
    const queued = articles.filter((article) => ["pending", "outline-review"].includes(article.queueStatus)).length;
    const generating = articles.filter((article) => article.queueStatus === "generating").length;
    const published = articles.filter((article) => article.queueStatus === "completed" && isArticlePublished(article)).length;
    const completed = articles.filter((article) => article.queueStatus === "completed" && !isArticlePublished(article)).length;
    const errors = articles.filter((article) => article.queueStatus === "error").length;
    return { queued, generating, completed, published, errors, active: queued + generating + errors };
  }, [articles]);

  const queueFilter = stage === "queued"
    ? ["pending", "generating", "outline-review", "cancelled"]
    : stage === "errors"
    ? ["error"]
    : ["pending", "generating", "outline-review", "error", "cancelled"];

  const summaryCards = [
    { label: "Queued", stage: "queued", value: counts.queued, icon: Clock3, tone: "text-indigo-700" },
    { label: "Generating", stage: "queued", value: counts.generating, icon: FileText, tone: "text-cyan-700" },
    { label: "Completed", stage: "completed", value: counts.completed, icon: CheckCircle2, tone: "text-emerald-700" },
    { label: "Published", stage: "published", value: counts.published, icon: Globe2, tone: "text-violet-700" },
    { label: "Errors", stage: "errors", value: counts.errors, icon: AlertCircle, tone: "text-rose-700" }
  ];

  return (
    <section className="articles-workspace animate-fade-in">
      <SectionHeader eyebrow="Create" title="Articles" action={<Button onClick={() => chooseStage("add")}><Plus size={16} />Add Titles</Button>} />

      <div className="article-status-strip mb-5" aria-label="Article status summary">
        {summaryCards.map((item) => {
          const Icon = item.icon;
          return (
            <button type="button" key={item.label} onClick={() => chooseStage(item.stage)} className="article-status-item" aria-label={`${item.value} ${item.label.toLowerCase()} articles`}>
              <div className={`flex items-center gap-2 text-xs ${item.tone}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{item.label}</div>
              <div className="mt-2 text-2xl font-semibold leading-none tabular-nums text-slate-950">{item.value}</div>
            </button>
          );
        })}
      </div>

      <div className="article-stage-tabs mb-5 flex overflow-x-auto" role="group" aria-label="Article workflow">
        {stages.map((item) => {
          const Icon = item.icon;
          const active = stage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => chooseStage(item.id)}
              aria-pressed={active}
              className={`article-stage-tab ${active ? "is-active" : ""}`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {stage === "mode" ? (
        <ModeSelector {...props} embedded />
      ) : stage === "add" ? (
        <AddToQueue {...props} embedded />
      ) : stage === "completed" || stage === "published" ? (
        <ArticlesList {...props} embedded publicationFilter={stage === "published" ? "published" : "local"} />
      ) : null}

      <div className={["queued", "errors"].includes(stage) ? "" : "hidden"}>
        <Queue {...props} embedded rowStatusFilter={queueFilter} />
      </div>

      {!articles.length ? (
        <div className="studio-empty mt-5 p-8 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <div className="text-base font-black text-slate-900">No articles yet</div>
          <div className="mt-1 text-sm font-semibold text-slate-500">Add article titles, then they will move through this workflow.</div>
        </div>
      ) : null}
    </section>
  );
}
