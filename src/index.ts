import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/** Cloudflare binding shape */
interface Env {
  PODSCAN_API_KEY: string;
}

/** MCP agent that talks to Podscan */
class PodcastMCP extends McpAgent {
  server = new McpServer({
    name: "Podcast Explorer",
    version: "1.0.0",
  });

  async init() {
    /* Search podcasts by text query */
    this.server.tool(
      "search_podcasts",
      { query: z.string().min(2), per_page: z.number().int().positive().optional() },
      async ({ query, per_page = 5 }) => {
        const url = new URL("https://podscan.fm/api/v1/podcasts/search");
        url.search = new URLSearchParams({ query, per_page: String(per_page) }).toString();

        const r = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${globalThis.PODSCAN_API_KEY}`,
            Accept: "application/json",
          },
        });
        if (!r.ok) return { content: [{ type: "text", text: `Podscan error ${r.status}` }] };

        const data = await r.json();
        const msg =
          (data.podcasts ?? [])
            .map((p: any) => `${p.podcast_title}  (id: ${p.podcast_id})`)
            .join("\n") || "No podcasts found.";
        return { content: [{ type: "text", text: msg }] };
      }
    );

    /* List episodes for a given podcast id */
    this.server.tool(
      "list_episodes",
      { podcast_id: z.string(), per_page: z.number().int().positive().optional() },
      async ({ podcast_id, per_page = 5 }) => {
        const url = `https://podscan.fm/api/v1/podcasts/${podcast_id}/episodes?per_page=${per_page}`;

        const r = await fetch(url, {
          headers: {
            Authorization: `Bearer ${globalThis.PODSCAN_API_KEY}`,
            Accept: "application/json",
          },
        });
        if (!r.ok) return { content: [{ type: "text", text: `Podscan error ${r.status}` }] };

        const data = await r.json();
        const msg =
          (data.episodes ?? [])
            .map((e: any) => `${e.episode_title} – ${e.posted_at?.slice(0, 10)}`)
            .join("\n") || "No episodes found.";
        return { content: [{ type: "text", text: msg }] };
      }
    );
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // expose the key to tools via global
    globalThis.PODSCAN_API_KEY = env.PODSCAN_API_KEY;

    const url = new URL(request.url);

    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      // @ts-ignore
      return PodcastMCP.serveSSE("/sse").fetch(request, env, ctx);
    }

    if (url.pathname === "/mcp") {
      // @ts-ignore
      return PodcastMCP.serve("/mcp").fetch(request, env, ctx);
    }

    return new Response("Not found", { status: 404 });
  },
};
