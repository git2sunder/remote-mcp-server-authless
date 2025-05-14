import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/* ---------- hard-coded key (remove when you swap back to env) ---------- */
const PODSCAN_API_KEY = "bVFRPBlrCyPaUcn9H2wbEtKGYkh3bJkCdmBn2WT1d844d5e6";
/* ---------------------------------------------------------------------- */


export class MyMCP extends McpAgent {
	server = new McpServer({ name: "Podcast Explorer", version: "1.2.0" });
  
	async init() {
	  /* ── 1. find podcasts ───────────────────────────── */
	  this.server.tool(
		"search_podcasts",
		{
		  query: z.string().min(2),
		  per_page: z.number().int().positive().max(50).optional(),
		},
		async ({ query, per_page = 5 }) => {
		  const url = new URL("https://podscan.fm/api/v1/podcasts/search");
		  url.search = new URLSearchParams({ query, per_page: String(per_page) }).toString();
  
		  const r = await fetch(url, {
			headers: { Authorization: `Bearer ${PODSCAN_API_KEY}`, Accept: "application/json" },
		  });
		  if (!r.ok) return text(`Podscan error ${r.status}`);
  
		  const data = await r.json();
		  const msg =
			(data.podcasts ?? [])
			  .map(
				(p: any) =>
				  `• ${p.podcast_name} → ${p.podcast_url || "no-url"}\n  ${truncate(
					p.podcast_description,
					120,
				  )}`,
			  )
			  .join("\n\n") || "No podcasts found.";
		  return text(msg);
		},
	  );
  
	  /* ── 2. list episodes of one podcast ────────────── */
	  this.server.tool(
		"list_episodes",
		{
		  podcast_id: z.string(),
		  per_page: z.number().int().positive().max(50).optional(),
		},
		async ({ podcast_id, per_page = 5 }) => {
		  const url = `https://podscan.fm/api/v1/podcasts/${podcast_id}/episodes?per_page=${per_page}`;
  
		  const r = await fetch(url, {
			headers: { Authorization: `Bearer ${PODSCAN_API_KEY}`, Accept: "application/json" },
		  });
		  if (!r.ok) return text(`Podscan error ${r.status}`);
  
		  const data = await r.json();
		  const msg =
			(data.episodes ?? [])
			  .map(
				(e: any) =>
				  `• ${e.episode_title} → ${e.episode_url}\n  (${
					e.posted_at?.slice(0, 10) || "no-date"
				  }) ${truncate(e.episode_description, 120)}`,
			  )
			  .join("\n\n") || "No episodes found.";
		  return text(msg);
		},
	  );
  
	  /* ── 3. full-text episode search ────────────────── */
	  this.server.tool(
		"search_episodes",
		{
		  query: z.string().min(2),
		  category_ids: z.string().optional(), // "ct_123,ct_456"
		  podcast_ids: z.string().optional(),  // "pd_123,pd_456"
		  per_page: z.number().int().positive().max(50).optional(),
		  order_by: z
			.enum(["best_match", "created_at", "title", "posted_at", "podcast_rating"])
			.optional(),
		  order_dir: z.enum(["asc", "desc"]).optional(),
		  podcast_region: z.string().optional(), // "US"
		},
		async (p) => {
		  const url = new URL("https://podscan.fm/api/v1/episodes/search");
		  const qs: Record<string, string> = { query: `"${p.query}"` };
		  if (p.category_ids) qs.category_ids = p.category_ids;
		  if (p.podcast_ids) qs.podcast_ids = p.podcast_ids;
		  qs.per_page = String(p.per_page ?? 5);
		  if (p.order_by) qs.order_by = p.order_by;
		  if (p.order_dir) qs.order_dir = p.order_dir;
		  if (p.podcast_region) qs.podcast_region = p.podcast_region;
		  url.search = new URLSearchParams(qs).toString();
  
		  const r = await fetch(url, {
			headers: { Authorization: `Bearer ${PODSCAN_API_KEY}`, Accept: "application/json" },
		  });
		  if (!r.ok) return text(`Podscan error ${r.status}`);
  
		  const data = await r.json();
		  const msg =
			(data.episodes ?? [])
			  .map(
				(e: any) =>
				  `• ${e.episode_title} → ${e.episode_url}\n  ${truncate(
					e.podcast?.podcast_name,
					50,
				  )} • ${e.posted_at?.slice(0, 10) || "no-date"}\n  ${truncate(
					e.episode_description,
					120,
				  )}`,
			  )
			  .join("\n\n") || "No episodes found.";
		  return text(msg);
		},
	  );
	}
  }
  
  /* ── helpers ─────────────────────────────────────────── */
  const text = (t: string) => ({ content: [{ type: "text", text: t }] });
  const truncate = (s: string = "", n = 60) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  
  /* ── worker entrypoint ───────────────────────────────── */
  export default {
	async fetch(request: Request, _env: unknown, ctx: ExecutionContext) {
	  const url = new URL(request.url);
  
	  if (url.pathname === "/sse" || url.pathname === "/sse/message")
		// @ts-ignore – decorator adds serveSSE
		return MyMCP.serveSSE("/sse").fetch(request, _env, ctx);
  
	  if (url.pathname === "/mcp")
		// @ts-ignore – decorator adds serve
		return MyMCP.serve("/mcp").fetch(request, _env, ctx);
  
	  return new Response("Not found", { status: 404 });
	},
  };