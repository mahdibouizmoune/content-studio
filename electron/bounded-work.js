'use strict';

async function mapBounded(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  const completed = await Promise.allSettled(Array.from({ length: Math.min(items.length, Math.max(1, concurrency)) }, next));
  const failed = completed.find((result) => result.status === 'rejected');
  if (failed) throw failed.reason;
  return results;
}

module.exports = { mapBounded };
const serialTails = new Map();

function runSerial(key, worker) {
  const pending = (serialTails.get(key) || Promise.resolve()).catch(() => {}).then(worker);
  serialTails.set(key, pending);
  pending.finally(() => { if (serialTails.get(key) === pending) serialTails.delete(key); }).catch(() => {});
  return pending;
}

module.exports.runSerial = runSerial;
