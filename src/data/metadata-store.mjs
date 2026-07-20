import { MODULE_ID, SETTINGS } from "../constants.mjs";
import { stampEntryFields, upsertTagOnEntries, pruneTagFromEntries } from "./metadata-ops.mjs";

export function getEntries() {
  return game.settings.get(MODULE_ID, SETTINGS.ENTRIES) ?? {};
}

let writeQueue = Promise.resolve();
function enqueue(job) {
  const run = writeQueue.then(job, job);
  writeQueue = run.catch(() => {});
  return run;
}

async function writeEntries(entries) {
  await game.settings.set(MODULE_ID, SETTINGS.ENTRIES, entries);
  return entries;
}

export async function setEntryFieldsForItems(items, patch) {
  return enqueue(() =>
    writeEntries(stampEntryFields(foundry.utils.deepClone(getEntries()), items, patch)),
  );
}

export async function setTagOnItems(items, tagId, add) {
  return enqueue(() =>
    writeEntries(upsertTagOnEntries(foundry.utils.deepClone(getEntries()), items, tagId, add)),
  );
}

export function getTags() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.TAGS) ?? []);
}

export async function setTags(tags) {
  await game.settings.set(MODULE_ID, SETTINGS.TAGS, tags);
  return tags;
}

export async function deleteTag(tagId) {
  await setTags(getTags().filter((t) => t.id !== tagId));
  return enqueue(() =>
    writeEntries(pruneTagFromEntries(foundry.utils.deepClone(getEntries()), tagId)),
  );
}
