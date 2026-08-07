// Что можно скормить в OffscreenCanvas для конвертации в WebP. Не входят сознательно:
// webp (уже webp), svg (вектор - растрирование теряет масштабируемость),
// gif/apng (canvas оставляет только первый кадр - тихая потеря анимации),
// tiff (браузеры его не декодируют).
export const CONVERTIBLE_IMAGE_EXTENSIONS = ["avif", "bmp", "jpeg", "jpg", "png"];

export function canConvertToWebp(item) {
  if (!item || item.isFolder) return false;
  const ext = item.path.split(".").pop().toLowerCase();
  return CONVERTIBLE_IMAGE_EXTENSIONS.includes(ext);
}

export function webpName(fileName) {
  return fileName.replace(/\.[^.]*$/, ".webp");
}

// хранилища в основном регистронезависимы (Windows), поэтому сверяемся с пониженным набором
export function resolveCollision(name, takenLowerSet) {
  if (!takenLowerSet.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? "" : name.slice(dot);
  for (let i = 2; ; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!takenLowerSet.has(candidate.toLowerCase())) return candidate;
  }
}
