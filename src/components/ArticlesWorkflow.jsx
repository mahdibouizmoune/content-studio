import { AlertCircle, CheckCircle2, Clock3, FileText, Globe2, LayoutGrid, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import AddToQueue from "@/components/AddToQueue";
import ArticlesList from "@/components/ArticlesList";
import ModeSelector from "@/components/ModeSelector";
import Queue from "@/components/Queue";
import SectionHeader from "@/components/SectionHeader";
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
    { label: "Queued", value: counts.queued, icon: Clock3, tone: "bg-indigo-50 text-indigo-700 ring-indigo-100" },
    { label: "Generating", value: counts.generating, icon: FileText, tone: "bg-cyan-50 text-cyan-700 ring-cyan-100" },
    { label: "Completed", value: counts.completed, icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
    { label: "Published", value: counts.published, icon: Globe2, tone: "bg-violet-50 text-violet-700 ring-violet-100" },
    { label: "Errors", value: counts.errors, icon: AlertCircle, tone: "bg-rose-50 text-rose-700 ring-rose-100" }
  ];

  return (
    <section className="animate-fade-in">
      <SectionHeader eyebrow="Articles" title="Articles">
        One place for article setup, queued generation, completed drafts, published posts, and errors.
      </SectionHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {summaryCards.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="soft-card flex min-h-[86px] items-center gap-3 rounded-lg p-4">
              <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ring-1 ${item.tone}`}><Icon className="h-5 w-5" /></div>
              <div className="min-w-0"><div className="text-2xl font-black leading-none text-slate-950">{item.value}</div><div className="mt-1.5 truncate text-sm font-semibold text-slate-500">{item.label}</div></div>
            </div>
          );
        })}
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm">
        {stages.map((item) => {
          const Icon = item.icon;
          const active = stage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => chooseStage(item.id)}
              className={`inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-md px-4 py-2 text-sm font-bold transition-colors ${
                active ? "bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
              }`}
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
        <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <div className="text-base font-black text-slate-900">No articles yet</div>
          <div className="mt-1 text-sm font-semibold text-slate-500">Add article titles, then they will move through this workflow.</div>
        </div>
      ) : null}
    </section>
  );
}
