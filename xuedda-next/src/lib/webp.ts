import sharp from 'sharp';

const WEBP_QUALITY = 78;

/**
 * Encode a JPEG/PNG buffer to WebP. Returns null for unsupported inputs
 * or on any failure so uploads can always fall back to the original file.
 */
export async function encodeWebp(buffer: Buffer, ext: string): Promise<Buffer | null> {
  const normalized = ext.toLowerCase();
  if (normalized !== '.jpg' && normalized !== '.jpeg' && normalized !== '.png') return null;

  try {
    return await sharp(buffer, { failOn: 'none' })
      .rotate()
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toBuffer();
  } catch {
    return null;
  }
}
