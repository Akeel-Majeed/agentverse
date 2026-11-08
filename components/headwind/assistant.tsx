"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp, MessageCircle, ShieldCheck, X } from "lucide-react";
import type { ChatTurn } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX = 500;
const SUGGESTIONS = ["What's my biggest risk?", "What if wheat drops to £160/t?", "What changed since my risk profile?", "What should I do about fertiliser?"];
const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

/** "3 tools · all figures traced" or "2 tools · 1 figure caught and rewritten". */
function checkNote(t: ChatTurn): string {
  const tools = t.tools?.length ?? 0;
  const toolText = tools ? `${tools} tool${tools === 1 ? "" : "s"}` : "no tools";
  const caught = t.checker?.flagged.length ?? 0;
  if (caught) return `${toolText} · ${caught} untraced figure${caught === 1 ? "" : "s"} caught and rewritten`;
  return `${toolText} · every figure traced to a tool`;
}

function Bubble({ side, children, muted }: { side: "me" | "it"; children: React.ReactNode; muted?: boolean }) {
  return (
    <div
      className={cn(
        "max-w-[85%] whitespace-pre-wrap break-words rounded-[20px] px-4 py-2.5 text-[15px] leading-snug",
        side === "me" ? "self-end rounded-br-md bg-[#1F6FEB] text-white" : "self-start rounded-bl-md bg-[#E9E8DC] text-ink",
        muted && "opacity-70"
      )}
    >
      {children}
    </div>
  );
}

function Typing() {
  return (
    <div className="self-start rounded-[20px] rounded-bl-md bg-[#E9E8DC] px-4 py-3" aria-label="Thinking">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-sub/70" style={{ animationDelay: `${i * 140}ms` }} />
        ))}
      </span>
    </div>
  );
}

/**
 * Bottom-right assistant: the same agent and conversation as iMessage. Questions asked by text
 * show here too, and either channel continues the other.
 */
export function Assistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/assistant", { cache: "no-store" });
      if (res.ok) setTurns(((await res.json()) as { turns: ChatTurn[] }).turns);
    } catch {
      /* offline: keep what we have */
    }
  }, []);

  // Load when opened, then keep in step with questions asked by iMessage.
  useEffect(() => {
    if (!open) return;
    void load();
    inputRef.current?.focus();
    const t = setInterval(load, 8000);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, load]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, pending, open]);

  if (pathname?.startsWith("/onboarding")) return null;

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || pending) return;
    setPending(question);
    setInput("");
    setError("");
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const body = (await res.json()) as { turn?: ChatTurn; error?: string };
      if (!res.ok || !body.turn) {
        setError(body.error ?? "Something went wrong. Try again.");
        setInput(question);
      } else {
        setTurns((prev) => [...prev.filter((t) => t.inboundMessageId !== body.turn!.inboundMessageId), body.turn!]);
      }
    } catch {
      setError("Couldn't reach the assistant. Check your connection.");
      setInput(question);
    } finally {
      setPending(null);
      void load();
    }
  };

  const shown = turns.filter((t) => t.status !== "answering" || t.question !== pending);

  return (
    <>
      {open ? (
        <section
          role="dialog"
          aria-label="Hedged assistant"
          className="fixed bottom-24 right-4 z-50 flex h-[min(620px,calc(100vh-8rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[24px] bg-card shadow-[0_24px_64px_rgba(18,22,17,0.16)] sm:right-6"
        >
          <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="flex items-center gap-2 text-[16px] font-medium tracking-[-0.02em] text-ink">
                <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-ink" />
                Ask Hedged
              </h2>
              <p className="mt-0.5 text-[12.5px] text-sub">Same conversation as iMessage. Reads your risk profile, changes nothing.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant" className={cn("rounded-full p-1.5 text-sub hover:bg-hover hover:text-ink", focus)}>
              <X className="h-4 w-4" aria-hidden />
            </button>
          </header>

          <div ref={listRef} className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4" aria-live="polite">
            {shown.length === 0 && !pending ? (
              <div className="m-auto flex flex-col items-center gap-4 px-2 text-center">
                <p className="text-[15px] text-sub">Ask about your risks, options, news or deadlines. Answers use the same figures as the dashboard.</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => ask(s)} className={cn("rounded-full border border-line bg-paper px-3 py-1.5 text-[13px] text-ink hover:bg-hover", focus)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {shown.map((t) => (
              <div key={t.inboundMessageId} className="flex flex-col gap-1.5">
                <Bubble side="me">{t.question}</Bubble>
                <p className="self-end pr-1 text-[11px] text-sub">
                  {t.channel === "imessage" ? "via iMessage" : "in the app"}
                  {t.createdAt ? ` · ${TIME.format(new Date(t.createdAt))}` : ""}
                </p>
                {t.status === "answered" && t.answer ? (
                  <>
                    <Bubble side="it">{t.answer}</Bubble>
                    <p className="flex items-center gap-1 self-start pl-1 text-[11px] text-sub">
                      <ShieldCheck className="h-3 w-3" aria-hidden />
                      {checkNote(t)}
                    </p>
                  </>
                ) : t.status === "failed" ? (
                  <Bubble side="it" muted>
                    Couldn&apos;t answer this one.
                  </Bubble>
                ) : (
                  <Typing />
                )}
              </div>
            ))}

            {pending ? (
              <div className="flex flex-col gap-1.5">
                <Bubble side="me">{pending}</Bubble>
                <Typing />
              </div>
            ) : null}
          </div>

          <form
            className="border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
          >
            {error ? <p className="px-2 pb-2 text-[12.5px] text-bad">{error}</p> : null}
            <div className="flex items-end gap-2 rounded-[20px] border border-line bg-paper px-3 py-2 focus-within:border-ink">
              <label htmlFor="assistant-input" className="sr-only">
                Your question
              </label>
              <textarea
                id="assistant-input"
                ref={inputRef}
                rows={1}
                value={input}
                maxLength={MAX}
                placeholder="Ask a question…"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void ask(input);
                  }
                }}
                className="max-h-28 min-h-[24px] flex-1 resize-none bg-transparent py-1 text-[15px] text-ink outline-none placeholder:text-sub/60"
              />
              <button
                type="submit"
                disabled={!input.trim() || Boolean(pending)}
                aria-label="Send"
                className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-paper disabled:opacity-30", focus)}
              >
                <ArrowUp className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close assistant" : "Ask Hedged"}
        className={cn(
          "fixed bottom-6 right-4 z-50 inline-flex h-14 items-center gap-2 rounded-full bg-ink pl-5 pr-6 text-[15px] font-medium text-paper shadow-[0_16px_40px_rgba(18,22,17,0.22)] transition-transform hover:-translate-y-0.5 sm:right-6",
          focus
        )}
      >
        {open ? <X className="h-5 w-5" aria-hidden /> : <MessageCircle className="h-5 w-5" aria-hidden />}
        {open ? "Close" : "Ask Hedged"}
      </button>
    </>
  );
}
