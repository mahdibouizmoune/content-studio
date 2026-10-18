export function checkpointArticleDraft(article, checkpoint) {
  return {
    ...article,
    ...(checkpoint.content ? { content: checkpoint.content } : {}),
    ...(checkpoint.generatedTitle ? { generatedTitle: checkpoint.generatedTitle } : {}),
    generationCheckpoint: checkpoint
  };
}

// Save completed paid work even when its companion task fails.
export async function checkpointParallelTasks(tasks, save) {
  const entries = Object.entries(tasks);
  const results = await Promise.allSettled(entries.map(([, task]) => task));
  const patch = {};
  let failure;
  let failed = false;
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') patch[entries[index][0]] = result.value;
    else { failed = true; failure ||= result.reason; }
  });
  if (Object.keys(patch).length) await save(patch);
  if (failed) throw failure instanceof Error ? failure : new Error(String(failure || 'Generation task failed'));
  return patch;
}
