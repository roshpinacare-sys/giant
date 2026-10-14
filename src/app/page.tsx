"use client";

// ערוץ הריבון — ממשק-קשר-ישיר בעלים↔ריבונות (Task 40-b)
// חוק-הערוץ: אין טענות-סוכנים לבעלים; הריבונות היא המפעילה; הבעלים מדבר כאן ישירות עם הריבונות.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  GitBranch,
  Gauge,
  KeyRound,
  Landmark,
  Library,
  Loader2,
  Lock,
  LogOut,
  Menu,
  MessagesSquare,
  RefreshCw,
  ScrollText,
  Send,
  ShieldCheck,
  Stamp,
  Terminal,
  Users,
} from "lucide-react";
import { FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ArchiveView, LedgerView } from "@/components/giant/views";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface SovereignMessage {
  id: string;
  from: string;
  kind: string;
  priority: string;
  subject: string;
  body: string;
  amount: number | null;
  currency: string | null;
  status: string;
  requestStatus: string | null;
  relayProcessed: boolean;
  meta: string | null;
  createdAt: string;
  repliedAt: string | null;
}

interface Summary {
  unreadForOwner: number;
  pendingRequests: number;
  pendingAmount: number;
  pendingCurrency: string | null;
  relayUnprocessed: number;
}

interface GitLandInfo {
  ok?: boolean;
  commit?: string;
  pushed?: boolean;
  deduped?: boolean;
  error?: string;
}

interface GitInboxEntry {
  at: string;
  role: string;
  source: string;
  kind: string;
  text: string;
}

interface GiantGitState {
  ok: boolean;
  error?: string;
  head: string | null;
  ledger: { count: number; lastLine: string | null };
  registry: { rows: number; lastLine: string | null };
  plans: { files: string[] };
  giant: { files: string[] };
  inbox: { count: number; last: GitInboxEntry[] };
  commits: { recent: string[] };
}

const KIND_LABELS: Record<string, string> = {
  BRIEFING: "תדריך",
  FUNDING: "בקשת-מימון",
  DECISION: "הכרעה",
  REPORT: "דיווח",
  REPLY: "תשובה",
  CLAIM: "טענת-סוכן",
};

const heNum = new Intl.NumberFormat("he-IL");
const heTime = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function fmtNum(n: number): string {
  return heNum.format(n);
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return heTime.format(d);
}

function parseMeta(meta: string | null): {
  llmError?: boolean;
  sources?: string[];
  gitLand?: GitLandInfo;
} {
  if (!meta) return {};
  try {
    const parsed: unknown = JSON.parse(meta);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const rec = parsed as Record<string, unknown>;
      return {
        llmError: typeof rec.llmError === "boolean" ? rec.llmError : undefined,
        sources: Array.isArray(rec.sources) ? rec.sources.map(String) : undefined,
        gitLand:
          rec.gitLand && typeof rec.gitLand === "object" && !Array.isArray(rec.gitLand)
            ? (rec.gitLand as GitLandInfo)
            : undefined,
      };
    }
    return {};
  } catch {
    return {};
  }
}

// מראה את חוקי-הסיכום של השרת — כדי-שהסטטיסטיקה-בלקוח תמיד תתלכד עם ה-API
function computeSummary(messages: SovereignMessage[]): Summary {
  const s: Summary = {
    unreadForOwner: 0,
    pendingRequests: 0,
    pendingAmount: 0,
    pendingCurrency: null,
    relayUnprocessed: 0,
  };
  for (const m of messages) {
    if (m.from === "SOVEREIGNTY" && m.status === "UNREAD") s.unreadForOwner += 1;
    if (m.requestStatus === "PENDING") {
      s.pendingRequests += 1;
      if (typeof m.amount === "number") {
        s.pendingAmount += m.amount;
        if (!s.pendingCurrency && m.currency) s.pendingCurrency = m.currency;
      }
    }
    if (m.from === "AGENT_RELAY" && !m.relayProcessed) s.relayUnprocessed += 1;
  }
  return s;
}

function mergeMessages(
  prev: SovereignMessage[],
  incoming: SovereignMessage[],
): SovereignMessage[] {
  const byId = new Map<string, SovereignMessage>();
  for (const m of prev) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "CRITICAL") {
    return (
      <Badge className="bg-red-600 text-white hover:bg-red-600">
        דחוף
      </Badge>
    );
  }
  if (priority === "HIGH") {
    return (
      <Badge className="border border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400">
        עדיפות-גבוהה
      </Badge>
    );
  }
  return null;
}

function RequestStatusChip({ status }: { status: string | null }) {
  if (status === "PENDING") {
    return (
      <Badge className="border border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400">
        ממתין-להכרעה
      </Badge>
    );
  }
  if (status === "APPROVED") {
    return (
      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
        אושר
      </Badge>
    );
  }
  if (status === "DECLINED") {
    return (
      <Badge className="bg-red-600 text-white hover:bg-red-600">
        נדחה
      </Badge>
    );
  }
  return null;
}

function RelayProcessedChip({ processed }: { processed: boolean }) {
  return processed ? (
    <Badge variant="secondary">עובדה</Badge>
  ) : (
    <Badge className="border border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400">
      טרם-עובדה
    </Badge>
  );
}

const NAV_ITEMS = [
  { id: "channel", label: "ערוץ הריבון", icon: MessagesSquare },
  { id: "ledger", label: "לדג'ר-האמת", icon: ScrollText },
  { id: "plans", label: "תוכניות-האם", icon: FileText },
  { id: "team", label: "הצוות", icon: Users },
  { id: "security", label: "אבטחה-וחוקים", icon: ShieldCheck },
  { id: "systems", label: "מנועים-ומדידות", icon: Gauge },
  { id: "archive", label: "ארכיון-מלא", icon: Library },
] as const;

export default function Home() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<SovereignMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null); // `${id}:${decision}`
  const [processingRelay, setProcessingRelay] = useState(false);

  const [owner, setOwner] = useState<boolean | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [gitState, setGitState] = useState<GiantGitState | null>(null);
  const [gitLoading, setGitLoading] = useState(false);
  const [landText, setLandText] = useState("");
  const [landing, setLanding] = useState(false);
  const [tab, setTab] = useState("inbox");
  const [view, setView] = useState("channel");
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior });
    });
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/sovereign/messages", { cache: "no-store" });
      if (!res.ok) throw new Error("נכשלה-טעינת-הערוץ");
      const data = (await res.json()) as { messages: SovereignMessage[] };
      setMessages((prev) =>
        prev.length === 0 ? data.messages : mergeMessages(prev, data.messages),
      );
      setError(null);
      setLastSync(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאת-רשת");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const t = setInterval(() => void refresh(), 20_000);
    return () => clearInterval(t);
  }, [refresh]);

  const loadGit = useCallback(async () => {
    setGitLoading(true);
    try {
      const res = await fetch("/api/git/state", { cache: "no-store" });
      const data = (await res.json()) as GiantGitState;
      setGitState(data);
    } catch {
      // דיווח-כנה בלבד: פאנל-הגיט יציג מצב-שגיאה
    } finally {
      setGitLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/sovereign/auth", { cache: "no-store" });
        const data = (await res.json()) as { owner: boolean };
        setOwner(data.owner);
      } catch {
        setOwner(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (owner) void refresh();
  }, [owner, refresh]);

  useEffect(() => {
    if (tab === "git" && !gitState && !gitLoading) void loadGit();
  }, [tab, gitState, gitLoading, loadGit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function renderView() {
    switch (view) {
      case "ledger":
        return <LedgerView />;
      case "plans":
        return <ArchiveView initialSectionId="plans" />;
      case "team":
        return <ArchiveView initialSectionId="team" />;
      case "security":
        return <ArchiveView initialSectionId="security" />;
      case "systems":
        return <ArchiveView initialSectionId="systems" />;
      case "archive":
        return <ArchiveView />;
      default:
        return null;
    }
  }

  useEffect(() => {
    if (!loading) scrollToBottom("auto");
  }, [loading, scrollToBottom]);

  const inbox = useMemo(
    () => messages.filter((m) => m.from === "SOVEREIGNTY" || m.from === "OWNER"),
    [messages],
  );
  const relay = useMemo(
    () => messages.filter((m) => m.from === "AGENT_RELAY"),
    [messages],
  );
  const summary = useMemo(() => computeSummary(messages), [messages]);

  async function markRead(m: SovereignMessage) {
    if (owner !== true) {
      setAuthOpen(true);
      return;
    }
    if (m.from !== "SOVEREIGNTY" || m.status !== "UNREAD") return;
    setMessages((prev) =>
      prev.map((x) => (x.id === m.id ? { ...x, status: "READ" } : x)),
    );
    try {
      const res = await fetch(`/api/sovereign/messages/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read" }),
      });
      if (!res.ok) throw new Error("נכשל-סימון-נקרא");
    } catch {
      void refresh();
    }
  }

  async function decide(m: SovereignMessage, decision: "APPROVED" | "DECLINED") {
    if (owner !== true) {
      setAuthOpen(true);
      return;
    }
    if (m.requestStatus !== "PENDING" || deciding) return;
    setDeciding(`${m.id}:${decision}`);
    try {
      const res = await fetch(`/api/sovereign/messages/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decide", requestStatus: decision }),
      });
      const data = (await res.json()) as {
        message?: SovereignMessage;
        ack?: SovereignMessage;
        error?: string;
      };
      if (!res.ok || !data.message || !data.ack) {
        throw new Error(data.error ?? "נכשל-רישום-ההכרעה");
      }
      setMessages((prev) => mergeMessages(prev, [data.message!, data.ack!]));
      toast({
        title: decision === "APPROVED" ? "ההכרעה נרשמה: אישור" : "ההכרעה נרשמה: דחייה",
        description: "הריבונות פועלת בהתאם.",
      });
    } catch (err) {
      toast({
        title: "שגיאה",
        description: err instanceof Error ? err.message : "שגיאת-רשת",
        variant: "destructive",
      });
      void refresh();
    } finally {
      setDeciding(null);
    }
  }

  async function send() {
    if (owner !== true) {
      setAuthOpen(true);
      return;
    }
    const body = draft.trim();
    if (!body || sending) return;
    const tempId = `temp-${Date.now()}`;
    setSending(true);
    setMessages((prev) =>
      mergeMessages(prev, [
        {
          id: tempId,
          from: "OWNER",
          kind: "REPLY",
          priority: "NORMAL",
          subject: "פניית בעלים",
          body,
          amount: null,
          currency: null,
          status: "UNREAD",
          requestStatus: null,
          relayProcessed: false,
          meta: null,
          createdAt: new Date().toISOString(),
          repliedAt: null,
        },
      ]),
    );
    scrollToBottom();
    try {
      const res = await fetch("/api/sovereign/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: "OWNER", body }),
      });
      const data = (await res.json()) as {
        ownerMessage?: SovereignMessage;
        reply?: SovereignMessage;
        error?: string;
      };
      if (!res.ok || !data.ownerMessage || !data.reply) {
        throw new Error(data.error ?? "נכשלה-שליחת-הפנייה");
      }
      setMessages((prev) =>
        mergeMessages(
          prev.filter((x) => x.id !== tempId),
          [data.ownerMessage!, data.reply!],
        ),
      );
      setDraft("");
      scrollToBottom();
      toast({ title: "הריבונות ענתה", description: "תשובתה מצורפת לתיבה." });
    } catch (err) {
      setMessages((prev) => prev.filter((x) => x.id !== tempId));
      toast({
        title: "השליחה נכשלה",
        description: err instanceof Error ? err.message : "שגיאת-רשת",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  async function processRelay() {
    if (owner !== true) {
      setAuthOpen(true);
      return;
    }
    if (processingRelay) return;
    setProcessingRelay(true);
    try {
      const res = await fetch("/api/sovereign/relay/process", { method: "POST" });
      const data = (await res.json()) as { processed?: number; error?: string };
      if (!res.ok || typeof data.processed !== "number") {
        throw new Error(data.error ?? "נכשל-עיבוד-התור-הפנימי");
      }
      if (data.processed === 0) {
        toast({ title: "אין טענות-טרם-עובדו", description: "התור הפנימי ריק." });
      } else {
        await refresh();
        toast({
          title: `עובדו ${data.processed} טענות`,
          description: "עמדת הריבונות נוספה לתיבה.",
        });
      }
    } catch (err) {
      toast({
        title: "שגיאה",
        description: err instanceof Error ? err.message : "שגיאת-רשת",
        variant: "destructive",
      });
    } finally {
      setProcessingRelay(false);
    }
  }

  async function login() {
    if (authBusy || !password.trim()) return;
    setAuthBusy(true);
    try {
      const res = await fetch("/api/sovereign/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { owner: boolean; error?: string };
      if (!res.ok || !data.owner) throw new Error(data.error ?? "מפתח-לא-תקין");
      setOwner(true);
      setPassword("");
      setAuthOpen(false);
      toast({
        title: "ניהול-הבעלים פעיל",
        description: "שער-headcorner נפתח — הערוץ וההכרעות בידיך.",
      });
      void refresh();
      void loadGit();
    } catch (err) {
      toast({
        title: "כניסה נדחתה",
        description: err instanceof Error ? err.message : "שגיאת-רשת",
        variant: "destructive",
      });
    } finally {
      setAuthBusy(false);
    }
  }

  async function logout() {
    try {
      await fetch("/api/sovereign/auth", { method: "DELETE" });
    } catch {
      // יציאה-מקומית בכל-מקרה
    }
    setOwner(false);
    toast({ title: "יצאת מניהול-הבעלים", description: "הפרונט הציבורי נשאר גלוי." });
    void refresh();
  }

  async function landNow() {
    const text = landText.trim();
    if (!text || landing || owner !== true) return;
    setLanding(true);
    try {
      const res = await fetch("/api/git/land", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        commit?: string;
        pushed?: boolean;
        deduped?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "הנחיתה-לגיט נכשלה");
      setLandText("");
      await loadGit();
      toast({
        title: data.deduped ? "ההוראה כבר נוחתה (מנע-כפילות)" : "ההוראה נחתה בגיט",
        description: data.commit
          ? `commit ${data.commit}${data.pushed ? " · pushed" : ""}`
          : undefined,
      });
    } catch (err) {
      toast({
        title: "נחיתה נכשלה",
        description: err instanceof Error ? err.message : "שגיאת-רשת",
        variant: "destructive",
      });
    } finally {
      setLanding(false);
    }
  }

  const stats: Array<{ label: string; value: string; tone: string }> = [
    { label: "לא-נקראו", value: fmtNum(summary.unreadForOwner), tone: "text-emerald-600 dark:text-emerald-400" },
    { label: "הכרעות-ממתינות", value: fmtNum(summary.pendingRequests), tone: "text-amber-600 dark:text-amber-400" },
    {
      label: "סכום-מבוקש",
      value: `${fmtNum(summary.pendingAmount)}${summary.pendingCurrency ? ` ${summary.pendingCurrency}` : ""}`,
      tone: "text-foreground",
    },
    { label: "טענות-טרם-עובדו", value: fmtNum(summary.relayUnprocessed), tone: "text-amber-600 dark:text-amber-400" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* כותרת */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-7xl items-start justify-between gap-4 px-4 py-5">
          <div className="flex min-w-0 items-start gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="mt-0.5 h-11 w-11 shrink-0 md:hidden"
              onClick={() => setNavOpen(true)}
              aria-label="פתיחת-תפריט"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
            <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">giant · מערכת-האמת</h1>
              <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                הערוץ-האחד · בעלים ↔ ריבונות
              </Badge>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              חוק-giant: ערוץ-אחד בלבד · אין טענות-סוכנים לבעלים · הריבונות היא המפעילה ומשיגה את המימון בעצמה · ניהול-הבעלים מאחורי מפתח-headcorner
            </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="lg"
              className="h-11"
              onClick={() => void refresh()}
              disabled={refreshing}
              aria-label="רענון הערוץ"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden="true" />
              רענון
            </Button>
            {owner === true ? (
              <Button
                variant="outline"
                size="lg"
                className="h-11 border-emerald-600/40 text-emerald-700 dark:text-emerald-400"
                onClick={() => void logout()}
                aria-label="יציאה מניהול-הבעלים"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                בעלים · יציאה
              </Button>
            ) : (
              <Button
                size="lg"
                className="h-11 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => setAuthOpen(true)}
                aria-label="כניסת-בעלים"
              >
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                כניסת-בעלים
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 items-stretch">
        <aside
          aria-label="ניווט-ראשי"
          className="sticky top-0 hidden h-fit w-60 shrink-0 flex-col gap-1 self-start px-3 py-6 md:flex"
        >
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? "page" : undefined}
              className={cn(
                "flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                view === item.id
                  ? "bg-emerald-600/10 font-semibold text-emerald-700 dark:text-emerald-400"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {item.label}
            </button>
          ))}
          <div className="mt-2 border-t pt-2">
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <Terminal className="h-4 w-4" aria-hidden="true" />
              פלטת-פקודות
              <kbd className="ms-auto rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-6 px-4 py-6">
        {view !== "channel" ? (
          renderView()
        ) : (
        <>
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>טעינת-הערוץ נכשלה</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              <span>{error} — הריבונות ממתינה לך כאן.</span>
              <Button size="lg" className="h-11" onClick={() => void refresh()}>
                נסה שוב
              </Button>
            </AlertDescription>
          </Alert>
        ) : loading ? (
          <div className="space-y-6" aria-busy="true" aria-label="טוען את הערוץ">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-10 w-64 rounded-full" />
            <div className="space-y-3">
              <Skeleton className="h-28 rounded-lg" />
              <Skeleton className="h-28 rounded-lg" />
              <Skeleton className="h-28 rounded-lg" />
            </div>
          </div>
        ) : (
          <>
            {/* סטטיסטיקה */}
            <section aria-label="מדדי-הערוץ">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {stats.map((s) => (
                  <Card key={s.label} className="p-4">
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                    <div className={cn("mt-1 text-2xl font-bold tabular-nums leading-tight", s.tone)}>
                      {s.value}
                    </div>
                  </Card>
                ))}
              </div>
            </section>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="h-11">
                <TabsTrigger value="inbox" className="min-h-[44px]">
                  תיבת הריבון
                  {summary.unreadForOwner > 0 && (
                    <Badge className="ms-2 h-5 min-w-5 px-1 bg-emerald-600 text-white hover:bg-emerald-600 tabular-nums">
                      {summary.unreadForOwner}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="relay" className="gap-2 min-h-[44px]">
                  טענות סוכנים · פנימי
                  <Badge
                    variant="outline"
                    className="border-muted-foreground/40 px-1.5 text-[10px] text-muted-foreground"
                  >
                    לא-לבעלים ישירות
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="git" className="gap-2 min-h-[44px]">
                  מנוע-הגיט · חי
                  <Badge
                    variant="outline"
                    className="border-muted-foreground/40 px-1.5 text-[10px] text-muted-foreground"
                  >
                    גיט→מוצר
                  </Badge>
                </TabsTrigger>
              </TabsList>

              {/* תיבת הריבון */}
              <TabsContent value="inbox" className="mt-4 space-y-4">
                <Card>
                  <CardContent className="p-4">
                    <div
                      ref={listRef}
                      className="sovereign-scroll max-h-[60vh] overflow-y-auto pe-1"
                      aria-label="הודעות הערוץ"
                    >
                      {inbox.length === 0 ? (
                        <p className="py-10 text-center text-sm text-muted-foreground">
                          התיבה ריקה — כתוב לריבונות למטה.
                        </p>
                      ) : (
                        inbox.map((m) => (
                          <motion.div
                            key={m.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25, ease: "easeOut" }}
                          >
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => void markRead(m)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  void markRead(m);
                                }
                              }}
                              className={cn(
                                "mb-3 rounded-lg border p-4 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/50",
                                m.from === "SOVEREIGNTY"
                                  ? "border-s-4 border-s-emerald-600 hover:bg-emerald-500/5"
                                  : "bg-muted/40 hover:bg-muted/60",
                              )}
                              aria-label={`הודעה: ${m.subject}`}
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                {m.from === "SOVEREIGNTY" ? (
                                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                                    הריבונות
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">אתה</Badge>
                                )}
                                <Badge variant="outline">
                                  {KIND_LABELS[m.kind] ?? m.kind}
                                </Badge>
                                <PriorityBadge priority={m.priority} />
                                {m.from === "SOVEREIGNTY" && m.status === "UNREAD" && (
                                  <span
                                    className="sovereign-unread-dot h-2 w-2 rounded-full bg-emerald-600"
                                    aria-label="לא-נקרא"
                                  />
                                )}
                                <span className="ms-auto text-xs text-muted-foreground tabular-nums">
                                  {fmtTime(m.createdAt)}
                                </span>
                              </div>
                              <h3 className="mt-2 font-semibold leading-snug">{m.subject}</h3>
                              <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">
                                {m.body}
                              </p>
                              {parseMeta(m.meta).llmError && (
                                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                                  מצב-מילוט: נוסח-שמירה (מנוע-הניסוח לא זמין בעת הניסוח)
                                </p>
                              )}
                              {parseMeta(m.meta).gitLand?.commit ? (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  נחיתה-לגיט: commit{" "}
                                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                                    {parseMeta(m.meta).gitLand?.commit}
                                  </code>
                                  {parseMeta(m.meta).gitLand?.pushed
                                    ? " · pushed"
                                    : " · מדווח-כנה בלבד"}
                                </p>
                              ) : parseMeta(m.meta).gitLand?.ok === false ? (
                                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                                  נחיתת-הגיט נכשלה — מדווח-כנה, אין-זיוף.
                                </p>
                              ) : null}
                              {(m.kind === "FUNDING" || m.kind === "DECISION") && (
                                <div className="mt-3 border-t pt-3 flex items-center justify-between gap-3 flex-wrap">
                                  <div className="flex items-center gap-3 flex-wrap">
                                    {typeof m.amount === "number" && (
                                      <div className="text-xl font-bold tabular-nums">
                                        {fmtNum(m.amount)}{" "}
                                        <span className="text-sm font-normal text-muted-foreground">
                                          {m.currency}
                                        </span>
                                      </div>
                                    )}
                                    <RequestStatusChip status={m.requestStatus} />
                                  </div>
                                  {m.requestStatus === "PENDING" && (
                                    <div className="flex items-center gap-2">
                                      <Button
                                        size="lg"
                                        className="h-11 bg-emerald-600 text-white hover:bg-emerald-700"
                                        disabled={deciding !== null}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void decide(m, "APPROVED");
                                        }}
                                      >
                                        {deciding === `${m.id}:APPROVED` && (
                                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                        )}
                                        אישור
                                      </Button>
                                      <Button
                                        size="lg"
                                        variant="outline"
                                        className="h-11"
                                        disabled={deciding !== null}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void decide(m, "DECLINED");
                                        }}
                                      >
                                        {deciding === `${m.id}:DECLINED` && (
                                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                        )}
                                        דחייה
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* מחברת-פניות */}
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                          e.preventDefault();
                          void send();
                        }
                      }}
                      placeholder="כתוב לריבונות…"
                      aria-label="כתיבת פנייה לריבונות"
                      className="min-h-[96px] resize-y text-sm"
                      dir="rtl"
                    />
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div
                        className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"
                        aria-live="polite"
                      >
                        {sending ? (
                          <>
                            <span>הריבונות מנסחת תשובה</span>
                            <span className="sovereign-dot font-bold">·</span>
                            <span className="sovereign-dot font-bold">·</span>
                            <span className="sovereign-dot font-bold">·</span>
                          </>
                        ) : owner !== true ? (
                          <span className="text-muted-foreground">
                            ניהול-הבעלים דורש מפתח-headcorner — שליחה תפתח את שער-הבעלים
                          </span>
                        ) : null}
                      </div>
                      <Button
                        size="lg"
                        className="h-11 min-w-40 bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={() => void send()}
                        disabled={sending || draft.trim().length === 0}
                        aria-label="שלח לריבונות"
                      >
                        {sending ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Send className="h-4 w-4" aria-hidden="true" />
                        )}
                        שלח לריבונות
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* טענות-סוכנים · פנימי */}
              <TabsContent value="relay" className="mt-4 space-y-4">
                {owner !== true && (
                  <Alert>
                    <Lock className="h-4 w-4" aria-hidden="true" />
                    <AlertTitle>חסוי-בק · חוק-הפרונט/הבק</AlertTitle>
                    <AlertDescription className="flex flex-col items-start gap-3">
                      <span>
                        התור-הפנימי של הריבונות גלוי לבעלים בלבד — מאחורי מפתח-headcorner.
                      </span>
                      <Button
                        size="lg"
                        className="h-11 bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={() => setAuthOpen(true)}
                      >
                        <KeyRound className="h-4 w-4" aria-hidden="true" />
                        כניסת-בעלים
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
                <Alert className="border-amber-500/40">
                  <Stamp className="h-4 w-4" aria-hidden="true" />
                  <AlertTitle>חוק-התור הפנימי</AlertTitle>
                  <AlertDescription>
                    טענות סוכנים מגיעות לריבונות בלבד — אף טענה אינה מגיעה לבעלים ישירות.
                    הריבונות בוחנת את התור ומעלה מכאן עמדה אחת מרוכזת לתיבת הריבון.
                  </AlertDescription>
                </Alert>

                <div className="flex justify-start">
                  <Button
                    size="lg"
                    className="h-11 bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => void processRelay()}
                    disabled={processingRelay || owner !== true}
                  >
                    {processingRelay ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    עבד טענות → עמדת ריבונות
                  </Button>
                </div>

                {relay.length === 0 ? (
                  <Card className="p-4">
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      אין טענות-סוכנים בתור הפנימי.
                    </p>
                  </Card>
                ) : (
                  relay.map((c) => (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                    >
                      <div className="mb-3 rounded-lg border bg-muted/30 p-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline">{KIND_LABELS.CLAIM}</Badge>
                          <RelayProcessedChip processed={c.relayProcessed} />
                          <span className="ms-auto text-xs text-muted-foreground tabular-nums">
                            {fmtTime(c.createdAt)}
                          </span>
                        </div>
                        <h3 className="mt-2 font-medium text-sm leading-snug">
                          {c.subject.replace(/\(trace\s+([a-f0-9]+)\)/i, "")}
                          {/\(trace\s+([a-f0-9]+)\)/i.test(c.subject) && (
                            <code className="ms-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                              trace {(/\(trace\s+([a-f0-9]+)\)/i.exec(c.subject) ?? [])[1]}
                            </code>
                          )}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                          {c.body}
                        </p>
                      </div>
                    </motion.div>
                  ))
                )}
              </TabsContent>

              {/* מנוע-הגיט-החי (גיט→מוצר) */}
              <TabsContent value="git" className="mt-4 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <GitBranch className="h-4 w-4" aria-hidden="true" />
                    כל-מה-שיש-בגיט הופך כאן מדפים-מפוזרים למערכת-חיה · Sandbox
                    {gitState?.head ? (
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {gitState.head}
                      </code>
                    ) : null}
                  </div>
                  <Button
                    variant="outline"
                    size="lg"
                    className="h-11"
                    onClick={() => void loadGit()}
                    disabled={gitLoading}
                    aria-label="רענון מנוע-הגיט"
                  >
                    <RefreshCw
                      className={cn("h-4 w-4", gitLoading && "animate-spin")}
                      aria-hidden="true"
                    />
                    רענון-מצב
                  </Button>
                </div>

                {!gitState ? (
                  <div className="space-y-3" aria-busy="true">
                    <Skeleton className="h-24 rounded-lg" />
                    <Skeleton className="h-24 rounded-lg" />
                  </div>
                ) : !gitState.ok ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" aria-hidden="true" />
                    <AlertTitle>קריאת-הגיט נכשלה</AlertTitle>
                    <AlertDescription>{gitState.error ?? "שגיאה-לא-ידועה"}</AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Card className="p-4">
                        <div className="text-xs text-muted-foreground">לדג'ר · D1</div>
                        <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                          {fmtNum(gitState.ledger.count)}
                        </div>
                      </Card>
                      <Card className="p-4">
                        <div className="text-xs text-muted-foreground">סוכנים-רשומים</div>
                        <div className="mt-1 text-2xl font-bold tabular-nums">
                          {fmtNum(gitState.registry.rows)}
                        </div>
                      </Card>
                      <Card className="p-4">
                        <div className="text-xs text-muted-foreground">תוכניות</div>
                        <div className="mt-1 text-2xl font-bold tabular-nums">
                          {fmtNum(gitState.plans.files.length)}
                        </div>
                      </Card>
                      <Card className="p-4">
                        <div className="text-xs text-muted-foreground">תיבת-הוראות</div>
                        <div className="mt-1 text-2xl font-bold tabular-nums">
                          {fmtNum(gitState.inbox.count)}/60
                        </div>
                      </Card>
                    </div>

                    <Card>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <Landmark className="h-4 w-4" aria-hidden="true" />
                          <h3 className="font-semibold text-sm">לדג'ר-האמת · שורה-אחרונה</h3>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {gitState.ledger.lastLine?.slice(0, 420) ?? "—"}
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                          <h3 className="font-semibold text-sm">רישום-הצוות · אחרון</h3>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {gitState.registry.lastLine?.slice(0, 300) ?? "—"}
                        </p>
                        <div className="pt-1 flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm">תוכניות:</h3>
                          {gitState.plans.files.slice(0, 5).map((f) => (
                            <code
                              key={f}
                              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                            >
                              {f}
                            </code>
                          ))}
                          {gitState.giant.files.map((f) => (
                            <code
                              key={f}
                              className="rounded bg-emerald-600/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700 dark:text-emerald-400"
                            >
                              giant/{f}
                            </code>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4 space-y-2">
                        <h3 className="font-semibold text-sm">
                          תיבת-ההוראות בגיט · {fmtNum(gitState.inbox.count)} שורות (bounded 60)
                          · קו-הבליעה-הקנוני
                        </h3>
                        {gitState.inbox.last.length === 0 ? (
                          <p className="text-xs text-muted-foreground">ריקה.</p>
                        ) : (
                          gitState.inbox.last.map((e, i) => (
                            <div
                              key={`${e.at}-${i}`}
                              className="rounded border bg-muted/30 p-2 text-xs"
                            >
                              <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
                                <Badge variant="outline" className="px-1 py-0 text-[10px]">
                                  {e.role}
                                </Badge>
                                <span>{e.source}</span>
                                <span className="tabular-nums">{e.at}</span>
                              </div>
                              <p className="mt-1 leading-relaxed">{e.text}</p>
                            </div>
                          ))
                        )}
                        <div className="pt-1">
                          <h3 className="font-semibold text-sm mb-1">commits אחרונים</h3>
                          <ul className="space-y-0.5">
                            {gitState.commits.recent.map((c) => (
                              <li
                                key={c}
                                className="font-mono text-[11px] text-muted-foreground truncate"
                              >
                                {c}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4 space-y-3">
                        <h3 className="font-semibold text-sm flex items-center gap-2">
                          <GitBranch className="h-4 w-4" aria-hidden="true" />
                          נחיתת-הוראה לגיט
                          {owner !== true && (
                            <Badge variant="outline" className="text-[10px]">
                              לבעלים בלבד
                            </Badge>
                          )}
                        </h3>
                        {owner !== true ? (
                          <Alert>
                            <Lock className="h-4 w-4" aria-hidden="true" />
                            <AlertTitle>שער-הבעלים</AlertTitle>
                            <AlertDescription>
                              ההוראה תנחת ל-inbox.jsonl עם commit ו-pushed אמת — לאחר כניסה עם
                              מפתח-headcorner.
                            </AlertDescription>
                          </Alert>
                        ) : (
                          <>
                            <Textarea
                              value={landText}
                              onChange={(e) => setLandText(e.target.value)}
                              placeholder="הוראה לצי / לריבונות — תנחת לקו-הבליעה הקנוני בגיט…"
                              aria-label="נוסח-הוראה"
                              className="min-h-[80px] resize-y text-sm"
                              dir="rtl"
                            />
                            <Button
                              size="lg"
                              className="h-11 bg-emerald-600 text-white hover:bg-emerald-700"
                              onClick={() => void landNow()}
                              disabled={landing || landText.trim().length === 0}
                            >
                              {landing ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                              ) : (
                                <GitBranch className="h-4 w-4" aria-hidden="true" />
                              )}
                              נחת-הוראה לגיט
                            </Button>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
        </>
        )}
      </main>
      </div>

      <footer className="border-t mt-auto pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-1 px-4 py-3 text-xs text-muted-foreground sm:flex-row">
          <span>giant · הערוץ-האחד · הריבונות היא המפעילה · אין טענות-סוכנים לבעלים · ⌘K-לפלטת-פקודות</span>
          <span className="tabular-nums">
            {lastSync ? `סנכרון אחרון: ${heTime.format(lastSync)}` : "טוען…"}
          </span>
        </div>
      </footer>

      {/* שער-הבעלים (headcorner) */}
      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              שער-הבעלים · מפתח-headcorner
            </DialogTitle>
            <DialogDescription>
              ניהול-הבעלים (ערוץ, הכרעות, נחיתות-גיט) מאובטח מאחורי המפתח.
              המפתח אינו נרשם ואינו נשלח לשום מקום נוסף.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void login();
              }
            }}
            placeholder="מפתח-הבעלים"
            aria-label="מפתח-הבעלים"
            dir="ltr"
            autoComplete="current-password"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAuthOpen(false)} disabled={authBusy}>
              ביטול
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => void login()}
              disabled={authBusy || password.length === 0}
            >
              {authBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <KeyRound className="h-4 w-4" aria-hidden="true" />
              )}
              כניסה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ניווט-מובייל */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="right" className="w-72" dir="rtl">
          <SheetHeader>
            <SheetTitle>ניווט · giant</SheetTitle>
            <SheetDescription>כל-המערכת ביד-אחת</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-2 pb-6">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setView(item.id);
                  setNavOpen(false);
                }}
                aria-current={view === item.id ? "page" : undefined}
                className={cn(
                  "flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  view === item.id
                    ? "bg-emerald-600/10 font-semibold text-emerald-700 dark:text-emerald-400"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {item.label}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* פלטת-פקודות ⌘K */}
      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandInput placeholder="חפש מסך או פעולה…" />
        <CommandList>
          <CommandEmpty>אין תוצאות.</CommandEmpty>
          <CommandGroup heading="מסכים">
            {NAV_ITEMS.map((item) => (
              <CommandItem
                key={item.id}
                onSelect={() => {
                  setView(item.id);
                  setPaletteOpen(false);
                }}
              >
                <item.icon className="me-2 h-4 w-4" aria-hidden="true" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="פעולות">
            <CommandItem
              onSelect={() => {
                void refresh();
                setPaletteOpen(false);
              }}
            >
              <RefreshCw className="me-2 h-4 w-4" aria-hidden="true" />
              רענון הערוץ
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setAuthOpen(true);
                setPaletteOpen(false);
              }}
            >
              <KeyRound className="me-2 h-4 w-4" aria-hidden="true" />
              שער-הבעלים
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setView("channel");
                setTab("git");
                setPaletteOpen(false);
              }}
            >
              <GitBranch className="me-2 h-4 w-4" aria-hidden="true" />
              מנוע-הגיט
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
