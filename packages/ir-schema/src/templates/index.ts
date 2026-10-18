import blogJson from "./blog.json" with { type: "json" };
import shopJson from "./shop.json" with { type: "json" };
import trackerJson from "./tracker.json" with { type: "json" };
import { IRDocument } from "../types.js";

export const blogTemplate = blogJson as unknown as IRDocument;
export const shopTemplate = shopJson as unknown as IRDocument;
export const trackerTemplate = trackerJson as unknown as IRDocument;

export const starterTemplates: Record<string, IRDocument> = {
  blog: blogTemplate,
  shop: shopTemplate,
  tracker: trackerTemplate
};
