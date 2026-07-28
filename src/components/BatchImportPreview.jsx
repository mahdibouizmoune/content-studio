import { AlertTriangle, CheckSquare2, Download, Trash2 } from "lucide-react";
import { Button, inputClass } from "@/components/ui";
import { detectCannibalization } from "@/lib/contentPlanning";
import { duplicateImportIds, findNamedOption, findSiteCategory, validateImportRow } from "@/lib/batchArticleImport.mjs";

const cellInput = `${inputClass} min-w-40 py-2 text-xs`;

function RowSelect({ checked, onChange, label }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
    />
  );
}

export default function BatchImportPreview({
  rows,
  settings,
  articles,
  errors,
  busy,
  onRowsChange,
  onSubmit,
  onDownloadSample
}) {
  const selectedCount = rows.filter((row) => row.selected).length;
  const duplicateIds = duplicateImportIds(rows);
  const cannibalization = new Map(rows.map((row) => [
    row.id,
    detectCannibalization(row.title, articles || [], { threshold: 62 })
  ]));

  function updateRow(id, patch) {
    onRowsChange(rows.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  function applyToSelected(patch) {
    onRowsChange(rows.map((row) => row.selected ? { ...row, ...patch } : row));
  }

  function removeSelected() {
    onRowsChange(rows.filter((row) => !row.selected));
  }

  function siteFor(row) {
    return findNamedOption(settings.wordpressSites, row.site);
  }

  return (
    <section className="mt-5 rounded-lg border border-slate-200 bg-white shadow-sm" aria-labelledby="batch-import-title">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 id="batch-import-title" className="text-base font-black text-slate-900">Import Preview</h2>
          <p className="mt-1 text-sm text-slate-600">{rows.length} rows loaded, {selectedCount} selected. Review before adding them to the queue.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => onRowsChange(rows.map((row) => ({ ...row, selected: true })))}
            disabled={!rows.length || busy}
          >
            <CheckSquare2 className="h-4 w-4" />Select All
          </Button>
          <Button variant="danger" onClick={removeSelected} disabled={!selectedCount || busy}>
            <Trash2 className="h-4 w-4" />Remove Selected
          </Button>
          <Button variant="secondary" onClick={onDownloadSample} disabled={busy}>
            <Download className="h-4 w-4" />Sample CSV
          </Button>
        </div>
      </div>

      {errors?.length ? (
        <div className="m-4 rounded-md bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-100" role="alert">
          <div className="font-black">Import errors</div>
          {errors.slice(0, 8).map((error, index) => (
            <div key={`${error.row}-${index}`}>Row {error.row}: {error.message}</div>
          ))}
          {errors.length > 8 ? <div>{errors.length - 8} more errors are not shown.</div> : null}
        </div>
      ) : null}

      <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
        <label className="text-xs font-bold text-slate-700">
          Apply preset to selected
          <select className={`${inputClass} mt-1 py-2 text-xs`} defaultValue="" onChange={(event) => event.target.value && applyToSelected({ preset: event.target.value })}>
            <option value="">Choose preset</option>
            {(settings.projectPresets || []).map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-700">
          Apply site to selected
          <select className={`${inputClass} mt-1 py-2 text-xs`} defaultValue="" onChange={(event) => event.target.value && applyToSelected({ site: event.target.value, category: "" })}>
            <option value="">Choose site</option>
            {(settings.wordpressSites || []).map((site) => <option key={site.id || site.url} value={site.id || site.url}>{site.name || site.url}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-700">
          Apply category to selected
          <select
            className={`${inputClass} mt-1 py-2 text-xs`}
            defaultValue=""
            onChange={(event) => {
              if (!event.target.value) return;
              const [siteId, categoryId] = event.target.value.split("::");
              onRowsChange(rows.map((row) => row.selected && String(siteFor(row)?.id || siteFor(row)?.url) === siteId
                ? { ...row, category: categoryId }
                : row));
            }}
          >
            <option value="">Choose category</option>
            {(settings.wordpressSites || []).flatMap((site) => (site.categories || []).map((category) => (
              <option key={`${site.id || site.url}-${category.id}`} value={`${site.id || site.url}::${category.id}`}>
                {site.name || site.url}: {category.name}
              </option>
            )))}
          </select>
        </label>
      </div>

      <div className="max-h-[58vh] overflow-auto">
        <table className="min-w-[2200px] table-fixed border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700">
            <tr>
              <th className="w-12 p-3"><span className="sr-only">Selected</span></th>
              <th className="w-72 p-3">Title</th>
              <th className="w-52 p-3">Primary keyword</th>
              <th className="w-60 p-3">Secondary keywords</th>
              <th className="w-40 p-3">Search intent</th>
              <th className="w-36 p-3">Content type</th>
              <th className="w-52 p-3">Preset</th>
              <th className="w-44 p-3">Article length</th>
              <th className="w-48 p-3">Brand voice</th>
              <th className="w-52 p-3">Site</th>
              <th className="w-48 p-3">Category</th>
              <th className="w-44 p-3">Publication</th>
              <th className="w-56 p-3">Schedule</th>
              <th className="w-44 p-3">Duplicate warning</th>
              <th className="w-64 p-3">Cannibalization warning</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const site = siteFor(row);
              const rowErrors = validateImportRow(row);
              const matches = cannibalization.get(row.id) || [];
              return (
                <tr key={row.id} className={`border-t border-slate-200 align-top ${row.selected ? "bg-white" : "bg-slate-50 opacity-70"}`}>
                  <td className="p-3"><RowSelect checked={row.selected} onChange={(event) => updateRow(row.id, { selected: event.target.checked })} label={`Select ${row.title || "untitled row"}`} /></td>
                  <td className="p-2">
                    <input aria-label="Title" className={cellInput} value={row.title} onChange={(event) => updateRow(row.id, { title: event.target.value })} />
                    {rowErrors.map((error) => <div key={error} className="mt-1 font-bold text-red-700">{error}</div>)}
                  </td>
                  <td className="p-2"><input aria-label="Primary keyword" className={cellInput} value={row.primaryKeyword} onChange={(event) => updateRow(row.id, { primaryKeyword: event.target.value })} /></td>
                  <td className="p-2"><input aria-label="Secondary keywords" className={cellInput} value={row.secondaryKeywords} onChange={(event) => updateRow(row.id, { secondaryKeywords: event.target.value })} /></td>
                  <td className="p-2">
                    <select aria-label="Search intent" className={cellInput} value={row.searchIntent} onChange={(event) => updateRow(row.id, { searchIntent: event.target.value })}>
                      <option value="informational">Informational</option>
                      <option value="commercial">Commercial</option>
                      <option value="transactional">Transactional</option>
                      <option value="navigational">Navigational</option>
                    </select>
                  </td>
                  <td className="p-2">
                    <select aria-label="Content type" className={cellInput} value={row.contentType} onChange={(event) => updateRow(row.id, { contentType: event.target.value })}>
                      <option value="article">Article</option>
                      <option value="listicle">Listicle</option>
                    </select>
                  </td>
                  <td className="p-2">
                    <select aria-label="Preset" className={cellInput} value={findNamedOption(settings.projectPresets, row.preset)?.id || ""} onChange={(event) => updateRow(row.id, { preset: event.target.value })}>
                      <option value="">Use batch default</option>
                      {(settings.projectPresets || []).map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                    </select>
                  </td>
                  <td className="p-2"><input aria-label="Article length" className={cellInput} value={row.articleLength} onChange={(event) => updateRow(row.id, { articleLength: event.target.value })} placeholder="1400-1800" /></td>
                  <td className="p-2">
                    <select aria-label="Brand voice" className={cellInput} value={findNamedOption(settings.brandVoices, row.brandVoice)?.id || ""} onChange={(event) => updateRow(row.id, { brandVoice: event.target.value })}>
                      <option value="">Use preset or default</option>
                      {(settings.brandVoices || []).map((voice) => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
                    </select>
                  </td>
                  <td className="p-2">
                    <select aria-label="WordPress site" className={cellInput} value={site?.id || site?.url || ""} onChange={(event) => updateRow(row.id, { site: event.target.value, category: "" })}>
                      <option value="">Use preset or default</option>
                      {(settings.wordpressSites || []).map((item) => <option key={item.id || item.url} value={item.id || item.url}>{item.name || item.url}</option>)}
                    </select>
                  </td>
                  <td className="p-2">
                    <select aria-label="WordPress category" className={cellInput} value={findSiteCategory(site, row.category)?.id || ""} onChange={(event) => updateRow(row.id, { category: event.target.value })}>
                      <option value="">Use preset or auto-match</option>
                      {(site?.categories || []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                  </td>
                  <td className="p-2">
                    <select aria-label="Publication preference" className={cellInput} value={row.publicationPreference} onChange={(event) => updateRow(row.id, { publicationPreference: event.target.value })}>
                      <option value="draft">Draft</option>
                      <option value="publish">Publish</option>
                      <option value="future">Schedule</option>
                    </select>
                  </td>
                  <td className="p-2"><input aria-label="Schedule" type="datetime-local" className={cellInput} value={row.schedule} disabled={row.publicationPreference !== "future"} onChange={(event) => updateRow(row.id, { schedule: event.target.value })} /></td>
                  <td className="p-3">
                    {duplicateIds.has(row.id) ? <span className="inline-flex items-center gap-1 font-bold text-red-700"><AlertTriangle className="h-4 w-4" />Duplicate in import</span> : <span className="text-slate-500">Clear</span>}
                  </td>
                  <td className="p-3">
                    {matches.length ? <span className="font-bold text-amber-700">{matches[0].score}% similar to {matches[0].article.generatedTitle || matches[0].article.title}</span> : <span className="text-slate-500">Clear</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-slate-600" role="status" aria-live="polite">
          {busy ? "Adding selected rows to the queue..." : `${selectedCount} row${selectedCount === 1 ? "" : "s"} ready`}
        </p>
        <Button onClick={onSubmit} disabled={!selectedCount || busy}>
          {busy ? "Adding..." : `Add ${selectedCount} to Queue`}
        </Button>
      </div>
    </section>
  );
}

