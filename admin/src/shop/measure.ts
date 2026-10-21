/**
 * The size of a picture the admin picked, read by the browser before anything
 * is sent. Its own module so the component tests can stand in for it: a test
 * browser has no image decoder.
 */
export async function measureImage(file: Blob): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      // honours the picture's EXIF orientation, as the server does
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    } catch {
      // not a picture this browser can read; the server will say what it is
    }
  }
  if (typeof URL.createObjectURL !== 'function') return null;
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The picture's bytes, for the upload. */
export async function fileBytes(file: Blob): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('could not read the file'));
    reader.readAsArrayBuffer(file);
  });
}
