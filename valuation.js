export function getItemsWithoutValue(items, projectId) {
  return items.filter((item) => item.projectId === projectId && (item.value === null || item.value === ""));
}

export function sanitizeValue(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildValuationPatch(item, fields) {
  return {
    ...item,
    value: sanitizeValue(fields.value),
    comment: fields.comment?.trim() || "",
    condition: fields.condition?.trim() || "",
    note: fields.note?.trim() || "",
  };
}

export function getTotalItemValue(items, projectId) {
  return items
    .filter((item) => item.projectId === projectId)
    .reduce((sum, item) => sum + (Number(item.value) || 0), 0);
}
