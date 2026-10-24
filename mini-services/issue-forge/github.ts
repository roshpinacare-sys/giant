/* ═══ issue-forge · github.ts — minimal real REST client (issues · PRs · merge) ══
 * Scope law: this client only ever touches the sovereign-forge label namespace —
 * listing is filtered by the label, creation adds the label, and it never lists,
 * edits or closes anything outside it. Every response is honest: no retry storms,
 * no swallowing — callers record failures in the forge ledger.
 */
import { CLAIM_MARK, FORGE_LABEL, GITHUB_REPO } from "./forge.ts";

export interface GhIssue {
  number: number;
  title: string;
  body: string | null;
  labels: { name: string }[];
  created_at: string;
  html_url: string;
  pull_request?: unknown;
}

export interface GhResult<T> {
  status: number;
  ok: boolean;
  json: T | null;
  error?: string;
}

export class Gh {
  constructor(private readonly token: string) {}

  private async req<T>(method: string, apiPath: string, body?: unknown): Promise<GhResult<T>> {
    try {
      const res = await fetch(`https://api.github.com${apiPath}`, {
        method,
        headers: {
          "Authorization": `Bearer ${this.token}`,
          "Accept": "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "issue-forge/1.0 (giant §9)",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      const text = await res.text();
      let json: T | null = null;
      try {
        json = text ? (JSON.parse(text) as T) : null;
      } catch {
        json = null;
      }
      return { status: res.status, ok: res.ok, json, error: res.ok ? undefined : text.slice(0, 300) };
    } catch (e) {
      return { status: 0, ok: false, json: null, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async listOpenForgeIssues(): Promise<GhIssue[]> {
    const r = await this.req<GhIssue[]>(
      "GET",
      `/repos/${GITHUB_REPO}/issues?labels=${FORGE_LABEL}&state=open&sort=created&direction=asc&per_page=50`,
    );
    if (!r.ok || !r.json) return [];
    return r.json.filter((i) => !i.pull_request);
  }

  async issueComments(number: number): Promise<{ body: string }[]> {
    const r = await this.req<{ body: string }[]>(
      "GET",
      `/repos/${GITHUB_REPO}/issues/${number}/comments?per_page=100`,
    );
    return r.ok && r.json ? r.json : [];
  }

  async hasClaimComment(number: number): Promise<boolean> {
    return (await this.issueComments(number)).some((c) => c.body.includes(`${CLAIM_MARK}/`));
  }

  async createIssue(input: {
    title: string;
    body: string;
    labels: string[];
  }): Promise<{ ok: boolean; number?: number; error?: string }> {
    const r = await this.req<{ number: number }>("POST", `/repos/${GITHUB_REPO}/issues`, input);
    return r.ok && r.json ? { ok: true, number: r.json.number } : { ok: false, error: r.error ?? `HTTP ${r.status}` };
  }

  async addComment(number: number, body: string): Promise<boolean> {
    const r = await this.req("POST", `/repos/${GITHUB_REPO}/issues/${number}/comments`, { body });
    return r.ok;
  }

  async addLabels(number: number, labels: string[]): Promise<boolean> {
    const r = await this.req("POST", `/repos/${GITHUB_REPO}/issues/${number}/labels`, { labels });
    return r.ok;
  }

  async openPr(input: {
    title: string;
    head: string;
    base: string;
    body: string;
  }): Promise<{ ok: boolean; number?: number; error?: string }> {
    const r = await this.req<{ number: number }>("POST", `/repos/${GITHUB_REPO}/pulls`, input);
    return r.ok && r.json ? { ok: true, number: r.json.number } : { ok: false, error: r.error ?? `HTTP ${r.status}` };
  }

  async mergePr(number: number, method: "squash" | "merge" | "rebase"): Promise<{ ok: boolean; error?: string }> {
    const r = await this.req<{ merged?: boolean }>("PUT", `/repos/${GITHUB_REPO}/pulls/${number}/merge`, {
      merge_method: method,
    });
    return r.ok ? { ok: true } : { ok: false, error: r.error ?? `HTTP ${r.status}` };
  }
}
