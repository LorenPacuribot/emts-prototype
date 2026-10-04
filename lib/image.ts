/*
  Browser-side image handling for uploaded pictures (presentation images,
  photo attachments). Records live in localStorage, so pictures are resized
  and re-encoded as JPEG data URLs to keep them small.
*/

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Reads an image file and returns a JPEG data URL no larger than `maxSide` pixels on its long side. */
export async function imageFileToDataUrl(file: File, maxSide = 1600, quality = 0.82): Promise<string> {
  return (await imageFileToJpeg(file, maxSide, quality)).dataUrl;
}

/** Like imageFileToDataUrl, and also returns the original's pixel size (its shape decides how social feeds crop it). */
export async function imageFileToJpeg(file: File, maxSide = 1600, quality = 0.82): Promise<{ dataUrl: string; width: number; height: number }> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error('Choose a JPG, PNG, WebP or GIF image.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Images must be under 12 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That file could not be read as an image.'));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Images are not supported in this browser.');
    // White behind transparent PNGs, since JPEG has no alpha.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { dataUrl: canvas.toDataURL('image/jpeg', quality), width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Opens the file picker and resolves with the chosen image (resized), or undefined when cancelled. */
export function pickImage(opts: { maxSide?: number; capture?: boolean } = {}): Promise<{ dataUrl: string; name: string } | undefined> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = IMAGE_TYPES.join(',');
    if (opts.capture) input.setAttribute('capture', 'environment');
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(undefined);
      imageFileToDataUrl(f, opts.maxSide).then((dataUrl) => resolve({ dataUrl, name: f.name }), reject);
    };
    input.click();
  });
}
