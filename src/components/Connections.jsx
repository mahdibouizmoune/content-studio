import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Clock3, RefreshCw, Settings2, Unplug } from "lucide-react";
import SectionHeader from "@/components/SectionHeader";
import { Button } from "@/components/ui";
import { electronAPI } from "@/lib/electron";

const definitions = [
  { id: "replicate", label: "Replicate", section: "api", testable: true },
  { id: "wordpress", label: "WordPress", section: "wordpress", testable: true },
  { id: "imgbb", label: "ImgBB", section: "pinCreator", testable: false },
  { id: "pinterestAnalytics", label: "Pinterest", section: "analytics", testable: true },
  { id: "googleSearchConsole", label: "Google Search Console", section: "analytics", testable: false },
  { id: "goHighLevel", label: "GoHighLevel", section: "analytics", testable: true },
  { id: "impact", label: "Impact", section: "affiliate", testable: true },
  { id: "amazon", label: "Amazon Associates", section: "affiliate", testable: true }
];

function resultState(result) {
  if (result?.success) return { state: "connected", message: result.message || result.username || "Connection successful." };
  const message = result?.error || "Connection test failed.";
  return {
    state: /401|403|unauthorized|forbidden|expired|invalid token|authentication/i.test(message) ? "expired" : "error",
    message
  };
}

export default function Connections({ settings, saveSettings, setActiveScreen, setSettingsSection }) {
  const [diagnostics, setDiagnostics] = useState(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    const result = await electronAPI.getDiagnostics();
    setDiagnostics(result);
  }

  useEffect(() => {
    refresh().catch((error) => setNotice(error.message || "Could not load connections."));
  }, []);

  const tests = useMemo(() => settings.connectionTests || {}, [settings.connectionTests]);
  const cards = useMemo(() => definitions.map((definition) => {
    const configured = Boolean(diagnostics?.connections?.[definition.id]);
    const last = tests[definition.id];
    return {
      ...definition,
      configured,
      state: last?.state && configured ? last.state : configured ? "connected" : "missing",
      message: last?.message || (configured ? "Configuration found." : "Required configuration is missing."),
      testedAt: last?.testedAt || ""
    };
  }), [diagnostics, tests]);

  function openSettings(section) {
    setSettingsSection?.(section);
    setActiveScreen("settings");
  }

  async function testConnection(card) {
    setBusy(card.id);
    setNotice(`Testing ${card.label}...`);
    let result;
    try {
      if (card.id === "replicate") {
        result = await electronAPI.testConnection(settings.replicateApiToken);
      } else if (card.id === "wordpress") {
        const site = settings.wordpressSites?.[0];
        result = site
          ? await electronAPI.testWordPressConnection({
            wordpressUrl: site.url,
            wordpressUsername: site.username,
            wordpressApiKey: site.apiKey
          })
          : { success: false, error: "Add a WordPress site first." };
      } else if (card.id === "pinterestAnalytics") {
        result = await electronAPI.testPinterestAnalytics();
      } else if (card.id === "goHighLevel") {
        result = await electronAPI.refreshGhlPublishingStatus();
      } else if (card.id === "impact") {
        result = await electronAPI.testImpactConnection({
          accountSid: settings.impactAccountSid,
          authToken: settings.impactAuthToken,
          mediaPropertyId: settings.impactMediaPropertyId
        });
      } else if (card.id === "amazon") {
        result = await electronAPI.testAmazonConnection({
          partnerTag: settings.amazonPartnerTag,
          marketplace: settings.amazonMarketplace,
          credentialId: settings.amazonCredentialId,
          credentialSecret: settings.amazonCredentialSecret,
          credentialVersion: settings.amazonCredentialVersion
        });
      } else {
        result = { success: false, error: "This service is checked when its settings are saved." };
      }
      const next = resultState(result);
      const testedAt = new Date().toISOString();
      await saveSettings({
        ...settings,
        connectionTests: {
          ...tests,
          [card.id]: { ...next, testedAt }
        }
      });
      setNotice(`${card.label}: ${next.message}`);
      await refresh();
    } catch (error) {
      const next = resultState({ success: false, error: error.message });
      await saveSettings({
        ...settings,
        connectionTests: {
          ...tests,
          [card.id]: { ...next, testedAt: new Date().toISOString() }
        }
      });
      setNotice(`${card.label}: ${next.message}`);
    } finally {
      setBusy("");
    }
  }

  const stateStyles = {
    connected: { label: "Connected", icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
    missing: { label: "Configuration missing", icon: Unplug, tone: "bg-slate-100 text-slate-700 ring-slate-200" },
    expired: { label: "Authentication expired", icon: Clock3, tone: "bg-amber-50 text-amber-800 ring-amber-100" },
    error: { label: "Connection error", icon: CircleAlert, tone: "bg-rose-50 text-rose-700 ring-rose-100" }
  };

  return (
    <section className="animate-fade-in">
      <SectionHeader eyebrow="System" title="Connections">
        Check every publishing, analytics, media, and affiliate service from one place. Credentials remain in Settings.
      </SectionHeader>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const state = stateStyles[card.state] || stateStyles.missing;
          const Icon = state.icon;
          return (
            <article key={card.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-slate-950">{card.label}</h2>
                  <div className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black ring-1 ${state.tone}`}>
                    <Icon className="h-3.5 w-3.5" />{state.label}
                  </div>
                </div>
              </div>
              <p className="mt-3 min-h-10 text-sm font-medium leading-5 text-slate-600">{card.message}</p>
              <div className="mt-2 text-xs font-semibold text-slate-400">
                Last tested: {card.testedAt ? new Date(card.testedAt).toLocaleString() : "Not tested"}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {card.testable ? (
                  <Button variant="secondary" onClick={() => testConnection(card)} disabled={busy === card.id || (!card.configured && card.id !== "amazon")}>
                    <RefreshCw className="h-4 w-4" />{busy === card.id ? "Testing..." : "Test"}
                  </Button>
                ) : null}
                <Button variant="secondary" onClick={() => openSettings(card.section)}><Settings2 className="h-4 w-4" />Open Settings</Button>
              </div>
            </article>
          );
        })}
      </div>
      {notice ? <div className="mt-4 rounded-md bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700 ring-1 ring-violet-100">{notice}</div> : null}
    </section>
  );
}
