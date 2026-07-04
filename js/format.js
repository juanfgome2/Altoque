export const statusLabels = {
  new: "Nuevo",
  accepted: "Aceptado",
  in_progress: "En camino",
  completed: "Completado",
  cancelled: "Cancelado"
};

export function formatDate(value) {
  if (!value) return "Sin fecha";
  const date = value.toDate ? value.toDate() : new Date(value);
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

export function formatMoney(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

export function normalizeSnapshot(snapshot) {
  const records = [];
  snapshot.forEach((document) => records.push({ id: document.id, ...document.data() }));
  return records;
}
