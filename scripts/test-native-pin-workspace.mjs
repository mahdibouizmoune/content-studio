import assert from "node:assert/strict";
const endpoint = process.argv[2];
let page;
for (let i = 0; i < 60; i++) {
  try {
    page = (await fetch(`${endpoint}/json`).then((r) => r.json())).find(
      (p) =>
        p.type === "page" &&
        /Content Studio|index\.html/.test(`${p.title} ${p.url}`),
    );
  } catch {}
  if (page?.webSocketDebuggerUrl) break;
  await new Promise((r) => setTimeout(r, 300));
}
assert.ok(page?.webSocketDebuggerUrl);
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => {
  socket.addEventListener("open", r, { once: true });
  socket.addEventListener("error", j, { once: true });
});
const pending = new Map();
let id = 0;
socket.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  const p = pending.get(m.id);
  if (!p) return;
  pending.delete(m.id);
  m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
});
function send(method, params) {
  const next = ++id;
  socket.send(JSON.stringify({ id: next, method, params }));
  return new Promise((resolve, reject) =>
    pending.set(next, { resolve, reject }),
  );
}
try {
  const response = await send("Runtime.evaluate", {
    returnByValue: true,
    awaitPromise: true,
    expression: `(async()=>{
   const api=window.electronAPI;
   const before=await api.pinWorkspace('snapshot');
   if(before.result.drafts.length||before.result.accounts.length)throw new Error('Use an empty isolated profile.');
   const account=await api.pinWorkspace('addCsvProfile',{name:'Native test',boards:['Recipes']});
   const pin=await api.pinWorkspace('writeDraft',{title:'Native test draft',description:'Test copy.',destination:'https://example.com/recipe',altText:'Test artwork',accountId:account.result.id,boardId:account.result.boards[0].id});
   const approval=await api.pinWorkspace('review',{ids:[pin.result.id],action:'approve'});
   const schedule=await api.pinWorkspace('schedule',{ids:[pin.result.id],accountId:account.result.id,channel:'direct'});
   const unknown=await api.pinWorkspace('unknown-operation');
   const after=await api.pinWorkspace('snapshot');
   const status=await api.pinWorkspace('apiStatus');
   return {created:pin.success,artworkRequired:!approval.success&&/artwork/.test(approval.error),approvalRequired:!schedule.success,allowlisted:!unknown.success,disabled:after.result.enabled===false,noJobs:after.result.jobs.length===0,noServer:status.result.running===false};
 })()`,
  });
  if (response.exceptionDetails)
    throw new Error(
      response.exceptionDetails.exception?.description ||
        response.exceptionDetails.text,
    );
  assert.deepEqual(response.result.value, {
    created: true,
    artworkRequired: true,
    approvalRequired: true,
    allowlisted: true,
    disabled: true,
    noJobs: true,
    noServer: true,
  });
  console.log(
    "Native Pin workspace passed: persistent profile/draft IPC, artwork and approval gates, disabled publishing, no external provider requests.",
  );
} finally {
  socket.close();
}
