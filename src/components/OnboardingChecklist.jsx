import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import SectionHeader from "@/components/SectionHeader";
import { Button } from "@/components/ui";

export default function OnboardingChecklist({
  settings,
  saveSettings,
  articles,
  setActiveScreen,
  setSettingsSection,
  openArticlesStage
}) {
  const wordpressSite = settings.wordpressSites?.find((site) => site.url && site.username && site.apiKey);
  const wordpressTest = settings.connectionTests?.wordpress;
  const steps = [
    { id: "replicate", label: "Add Replicate token", ready: Boolean(settings.replicateApiToken), section: "api" },
    { id: "wordpress", label: "Connect WordPress", ready: Boolean(wordpressSite), section: "wordpress", optional: true },
    { id: "text-model", label: "Select a text model", ready: Boolean(settings.aiModel), section: "api" },
    { id: "image-model", label: "Select an image model", ready: Boolean(settings.imageModel), section: "image" },
    { id: "article-defaults", label: "Configure article defaults", ready: Boolean(settings.articleLength), section: "general" },
    {
      id: "brand-voice",
      label: "Configure brand voice",
      ready: Boolean(settings.projectPresets?.some((preset) => preset.brandVoiceId)),
      section: "brandVoices",
      optional: true
    },
    {
      id: "pinterest",
      label: "Configure Pinterest",
      ready: Boolean(settings.pinCreator?.boardNames?.length),
      section: "pinCreator",
      optional: true
    },
    {
      id: "test-wordpress",
      label: "Test WordPress",
      ready: wordpressTest?.state === "connected",
      screen: "connections",
      optional: true
    },
    {
      id: "test-draft",
      label: "Generate a test draft",
      ready: articles.some((article) => Boolean(article.content)),
      screen: "articles",
      articleStage: "add",
      optional: true
    }
  ];
  const complete = steps.filter((step) => step.ready).length;

  function openStep(step) {
    if (step.section) {
      setSettingsSection(step.section);
      setActiveScreen("settings");
      return;
    }
    if (step.articleStage) {
      openArticlesStage(step.articleStage);
      return;
    }
    setActiveScreen(step.screen || "articles");
  }

  async function finish() {
    await saveSettings({
      ...settings,
      onboardingCompleted: true,
      onboardingCompletedAt: new Date().toISOString()
    });
    setActiveScreen("articles");
  }

  return (
    <section className="animate-fade-in">
      <SectionHeader eyebrow="First launch" title="Set Up Content Studio">
        Complete the essentials, then add optional publishing and growth connections when you are ready.
      </SectionHeader>
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="text-sm font-black text-slate-700">{complete} of {steps.length} complete</div>
          <div className="h-2 w-48 max-w-[45vw] overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600" style={{ width: `${Math.round((complete / steps.length) * 100)}%` }} />
          </div>
        </div>
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white shadow-sm">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center gap-3 p-4">
              {step.ready
                ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                : <Circle className="h-5 w-5 shrink-0 text-slate-300" />}
              <div className="min-w-0 flex-1">
                <div className="font-black text-slate-900">{index + 1}. {step.label}</div>
                <div className="mt-0.5 text-xs font-semibold text-slate-500">{step.optional ? "Optional" : "Recommended before generation"}</div>
              </div>
              <Button variant="secondary" onClick={() => openStep(step)}>
                <ExternalLink className="h-4 w-4" />{step.ready ? "Review" : "Set Up"}
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setActiveScreen("articles")}>Continue for Now</Button>
          <Button onClick={finish}>Finish Setup</Button>
        </div>
        <p className="mt-3 text-right text-xs font-semibold text-slate-500">
          Finish Setup hides this checklist. You can reopen it from Settings.
        </p>
      </div>
    </section>
  );
}
