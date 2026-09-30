export function configurationAuditChanges(entries) {
  const changes = {};
  for (const { path, before, after } of entries) {
    if (JSON.stringify(before) !== JSON.stringify(after)) changes[path] = { before, after };
  }
  return changes;
}
