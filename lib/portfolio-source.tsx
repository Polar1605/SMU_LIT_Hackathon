"use client";

/**
 * Tells the evidence viewer where a document's bytes actually live.
 *
 * The CUAD and synthetic corpora are static files served from /corpus and
 * /parsed, fetched by URL. An uploaded document exists only in the browser's
 * own memory — there is no server file to fetch, since nothing was ever
 * written to a server. This context is how the evidence viewer tells the two
 * cases apart without needing to know which portfolio is currently showing.
 */

import { createContext, useContext } from "react";
import type { UploadedDocument } from "./client-pipeline.ts";

export const PortfolioSourceContext = createContext<Map<string, UploadedDocument> | null>(null);

/** null when nothing has been uploaded — every document then falls back to its static URL. */
export function useUploadedDocument(docId: string): UploadedDocument | null {
  const map = useContext(PortfolioSourceContext);
  return map?.get(docId) ?? null;
}
