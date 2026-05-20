export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function compressionRatio(original: number, converted: number): number {
  if (original <= 0) return 0;
  return Math.round((1 - converted / original) * 100);
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function estimateHtmlSize(embedBase64Length: number, configBytes = 2048): number {
  return embedBase64Length + configBytes + 12_000;
}
