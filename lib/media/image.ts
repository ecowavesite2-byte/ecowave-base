import sharp from "sharp";

/**
 * sharp image pipeline for uploads and named crops.
 *
 * Re-encoding is the security boundary: any polyglot or malformed input that
 * survives the magic-byte sniff is fully decoded and re-emitted as WebP with
 * metadata stripped, so nothing from the original container is preserved.
 */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_UPLOAD_PIXELS = 30_000_000;
export const MAX_OUTPUT_DIMENSION = 4096;

export interface ReencodedImage {
  data: Buffer;
  width: number;
  height: number;
  format: string;
  size: number;
}

export async function reencodeToWebp(input: Buffer): Promise<ReencodedImage> {
  const { data, info } = await sharp(input, {
    limitInputPixels: MAX_UPLOAD_PIXELS,
    failOn: "error",
  })
    // bake EXIF orientation, then bound the output size
    .rotate()
    .resize({
      width: MAX_OUTPUT_DIMENSION,
      height: MAX_OUTPUT_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  return {
    data,
    width: info.width,
    height: info.height,
    format: "webp",
    size: info.size,
  };
}

/** Fixed named crops (width x height), generated as sibling files. */
export const CROPS = {
  "1:1": { width: 800, height: 800 },
  "3:4": { width: 600, height: 800 },
  "16:9": { width: 1280, height: 720 },
  Card: { width: 320, height: 213 },
  Hero: { width: 1280, height: 640 },
} as const;

export type CropName = keyof typeof CROPS;

export const CROP_SLUGS: Record<CropName, string> = {
  "1:1": "1x1",
  "3:4": "3x4",
  "16:9": "16x9",
  Card: "card",
  Hero: "hero",
};

export async function renderCrop(input: Buffer, name: CropName): Promise<Buffer> {
  const { width, height } = CROPS[name];
  return sharp(input, { limitInputPixels: MAX_UPLOAD_PIXELS, failOn: "error" })
    .rotate()
    .resize({ width, height, fit: "cover", position: "attention" })
    .webp({ quality: 82 })
    .toBuffer();
}
