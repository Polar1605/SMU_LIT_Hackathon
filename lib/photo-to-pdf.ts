/**
 * Wraps a photographed page into a single-page PDF, client-side, so the
 * "Photos" and "Scan a document" upload sources can feed the same
 * ingest -> extract pipeline that already handles every other format. Nothing
 * downstream needs to know a document started life as a JPEG.
 *
 * pdf-lib is isomorphic — it does not touch Node's filesystem or any
 * native module to embed an image, only to render text with a bundled font,
 * which this does not need — so the identical library already used to build
 * the corpus server-side also runs unmodified in the browser.
 */

import { PDFDocument } from "pdf-lib";

const HEIC_TYPES = new Set(["image/heic", "image/heif"]);

export class UnsupportedImageError extends Error {}

export async function photoToPdf(file: File): Promise<File> {
  // HEIC/HEIF (the default on iPhone) cannot be decoded by <canvas>/pdf-lib in
  // any browser except Safari. Rather than silently produce a blank or
  // corrupt page, refuse with an actionable message — the phone's camera
  // settings almost always offer "Most Compatible" (JPEG) as an alternative.
  if (HEIC_TYPES.has(file.type) || /\.(heic|heif)$/i.test(file.name)) {
    throw new UnsupportedImageError(
      `${file.name} is a HEIC/HEIF photo, which browsers cannot read directly. On iPhone, switch ` +
        `Settings > Camera > Formats to "Most Compatible" and retake the photo, or choose a JPEG/PNG file instead.`,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await PDFDocument.create();

  const isPng = file.type === "image/png" || /\.png$/i.test(file.name);
  const image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);

  const page = doc.addPage([image.width, image.height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });

  const pdfBytes = await doc.save();
  const pdfName = file.name.replace(/\.[^.]+$/, "") + ".pdf";
  // TS's DOM lib brands Uint8Array by its buffer type (ArrayBuffer vs the
  // wider ArrayBufferLike pdf-lib returns); Blob accepts a Uint8Array of
  // either at runtime, so this is a type-only cast, not a behavior change.
  return new File([pdfBytes as BlobPart], pdfName, { type: "application/pdf" });
}
