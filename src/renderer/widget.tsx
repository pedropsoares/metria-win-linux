import { useEffect, useRef, useState, type CSSProperties, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { clampPercent, DEFAULT_WIDGET_Y_OFFSET, PROVIDER_LOGOS, WIDGET_COLLAPSED_THICKNESS, WIDGET_ITEM_HEIGHT, WIDGET_PEEK_EXTENT, WIDGET_SLIDE_MS } from "../shared/types";
import type { ProviderKind, ProviderUsage, WidgetPosition } from "../shared/types";
import "./app.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

const ACCENT: Record<ProviderKind, string> = {
  "Claude": "#ff9f0a",
  "Codex": "#0a84ff",
  "OpenCode Go": "#ffffff",
  "Cursor": "#8e8e93"
};

function primary(provider: ProviderUsage): number { return provider.windows[0]?.percent ?? 0; }

function Ring({ provider, alert }: { provider: ProviderUsage; alert: { enabled: boolean; cautionThreshold: number; warningThreshold: number; criticalThreshold: number; cautionColor: string; warningColor: string; criticalColor: string } }): JSX.Element {
  const clamped = clampPercent(primary(provider));
  const r = 17;
  const c = 2 * Math.PI * r;
  const stroke = alert.enabled && clamped >= alert.criticalThreshold ? alert.criticalColor : alert.enabled && clamped >= alert.warningThreshold ? alert.warningColor : alert.enabled && clamped >= alert.cautionThreshold ? alert.cautionColor : provider.kind === "Codex" ? "url(#codex-ring)" : ACCENT[provider.kind];
  return (
    <span className="relative block h-[38px] w-[38px]">
      <svg className="absolute inset-0" width="38" height="38" viewBox="0 0 38 38">
        {provider.kind === "Codex" && (
          <defs>
            <linearGradient id="codex-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#0a84ff" />
              <stop offset="1" stopColor="#bf5af2" />
            </linearGradient>
          </defs>
        )}
        <circle cx="19" cy="19" r={r} fill="none" stroke="#2c2c2c" strokeWidth="5" />
        <circle
          cx="19" cy="19" r={r} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round"
          strokeDasharray={`${c.toFixed(2)} ${c.toFixed(2)}`}
          strokeDashoffset={(c * (1 - clamped / 100)).toFixed(2)}
          transform="rotate(-90 19 19)"
        />
      </svg>
      <img className="pointer-events-none absolute inset-0 m-auto h-[15px] w-[15px] object-contain" src={`./${PROVIDER_LOGOS[provider.kind]}`} alt="" />
    </span>
  );
}

const DRAG_THRESHOLD = 4;

/** Points the way the widget will slide when hovered, so the collapsed peek reads as a
 * handle rather than as a stray line on the screen edge — the macOS notch shows the same
 * hint via `hiddenHintSymbolName`. */
function PeekChevron({ position }: { position: WidgetPosition }): JSX.Element {
  const rotation = position === "right" ? 0 : position === "left" ? 180 : position === "top" ? 270 : 90;
  return (
    <svg width="7" height="10" viewBox="0 0 7 10" fill="none" style={{ transform: `rotate(${rotation}deg)` }} aria-hidden="true">
      <path d="M5.25 1L1.25 5l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Widget(): JSX.Element {
  // The dashboard can enable/disable providers at any time; refresh our cached
  // settings/usage as soon as the main process broadcasts a change so the notch
  // picks up the new provider immediately instead of waiting for the poll cycle.
  useEffect(() => {
    window.metria.onSettingsChanged(() => { void queryClient.invalidateQueries(); });
    window.metria.onUsageChanged(() => { void queryClient.invalidateQueries({ queryKey: ["usage"] }); });
  }, []);
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => window.metria.getSettings() });
  // The main process owns the reveal/collapse state (see widget-geometry.ts and
  // its use in main/index.ts); the renderer only mirrors it and reinforces the
  // main-owned cursor poll with real DOM hover events.
  const [revealed, setRevealed] = useState(true);
  const behavior = settings.data?.widgetBehavior;
  useEffect(() => {
    window.metria.onWidgetReveal(() => setRevealed(true));
    window.metria.onWidgetCollapse(() => setRevealed(false));
  }, []);
  useEffect(() => { if (behavior) setRevealed(behavior !== "auto-hide"); }, [behavior]);
  const dragging = useRef(false);
  const position = settings.data?.widgetPosition ?? "right";
  const vertical = position === "left" || position === "right";
  const autoHide = behavior === "auto-hide";
  const size = settings.data?.widgetSize ?? "medium";
  const usage = useQuery({
    queryKey: ["usage"],
    queryFn: () => window.metria.getUsage(),
    refetchInterval: settings.data ? settings.data.refreshIntervalSeconds * 1000 : undefined
  });
  const drag = useRef<{ startScreen: number; startOffset: number } | null>(null);
  const moved = useRef(false);
  const offsetRef = useRef(DEFAULT_WIDGET_Y_OFFSET);
  const pendingTarget = useRef<number | null>(null);
  const frameScheduled = useRef(false);
  useEffect(() => { if (settings.data) offsetRef.current = settings.data.widgetAlongEdgeOffset || settings.data.widgetYOffset; }, [settings.data]);
  const scheduleMove = (target: number): void => {
    pendingTarget.current = target;
    if (frameScheduled.current) return;
    frameScheduled.current = true;
    requestAnimationFrame(() => {
      frameScheduled.current = false;
      const value = pendingTarget.current;
      pendingTarget.current = null;
      if (value === null) return;
      // Keep the drag base in sync with the persisted (clamped) value so each
      // new drag starts from the widget's actual position instead of a stale one.
      void window.metria.setWidgetYOffset(value).then((settings) => { offsetRef.current = settings.widgetYOffset; });
    });
  };
  const visible = (usage.data ?? []).filter((provider) => settings.data?.enabledProviders.includes(provider.kind));
  // Keep provider items mounted while auto-hide is active so the rail remains
  // discoverable and can recover even when a window manager misses hover events.
  const displayed = visible;
  const onPointerDown = (event: React.PointerEvent<HTMLElement>): void => {
    moved.current = false;
    dragging.current = true;
    // Keep the widget revealed for the whole drag: a fast drag can carry the
    // window out from under a stationary cursor, and a stray mouseleave must
    // not schedule a mid-drag collapse.
    if (autoHide) void window.metria.setWidgetHoverState(true);
    // Use screenY, not clientY: the widget window moves while dragging, so
    // viewport-relative coordinates shift on their own and make the drag
    // oscillate (ghost effect). screenY is global and stays stable.
    drag.current = { startScreen: vertical ? event.screenY : event.screenX, startOffset: offsetRef.current };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLElement>): void => {
    const dragState = drag.current;
    if (!dragState) return;
    const delta = Math.round((vertical ? event.screenY : event.screenX) - dragState.startScreen);
    if (Math.abs(delta) > DRAG_THRESHOLD) {
      if (!moved.current) void window.metria.setProviderHover(null);
      moved.current = true;
      scheduleMove(dragState.startOffset + delta);
    }
  };
  const onPointerUp = (event: React.PointerEvent<HTMLElement>): void => {
    drag.current = null;
    dragging.current = false;
    if (autoHide) void window.metria.setWidgetHoverState(true);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* Not captured. */ }
    if (moved.current) {
      // The widget moved while dragging; re-assess the hover so the card shows
      // again for the item now under the cursor instead of staying stale/hidden.
      const hit = document.elementsFromPoint(event.clientX, event.clientY)
        .find((element) => element instanceof HTMLElement && element.dataset.index !== undefined);
      void window.metria.setProviderHover(hit instanceof HTMLElement ? Number(hit.dataset.index) : null);
    }
  };
  const collapsed = autoHide && !revealed;
  const opacity = settings.data?.widgetOpacity ?? 1;
  const slide = `${WIDGET_SLIDE_MS}ms`;
  // The surface slides fully past its own screen edge instead of the window being
  // resized frame by frame. The main process holds the window at its expanded rect for
  // the whole animation and shrinks to the peek once, after this transition ends.
  const offEdge = position === "right" ? "translate3d(100%, 0, 0)" : position === "left" ? "translate3d(-100%, 0, 0)" : position === "top" ? "translate3d(0, -100%, 0)" : "translate3d(0, 100%, 0)";
  const shellRadius = position === "right" ? "18px 0 0 18px" : position === "left" ? "0 18px 18px 0" : position === "top" ? "0 0 18px 18px" : "18px 18px 0 0";
  const peekRadius = position === "right" ? "7px 0 0 7px" : position === "left" ? "0 7px 7px 0" : position === "top" ? "0 0 7px 7px" : "7px 7px 0 0";
  // Anchored to the screen edge and centred along it, matching the collapsed window rect
  // so the pill lands identically whether the window is still expanded (mid-slide) or
  // already shrunk. `min(..., 100%)` covers a rail shorter than the peek itself.
  const peekStyle: CSSProperties = vertical
    ? { top: "50%", transform: "translateY(-50%)", width: WIDGET_COLLAPSED_THICKNESS, height: `min(${WIDGET_PEEK_EXTENT}px, 100%)`, ...(position === "right" ? { right: 0 } : { left: 0 }) }
    : { left: "50%", transform: "translateX(-50%)", height: WIDGET_COLLAPSED_THICKNESS, width: `min(${WIDGET_PEEK_EXTENT}px, 100%)`, ...(position === "top" ? { top: 0 } : { bottom: 0 }) };
  return (
    // Hover and drag live on the wrapper, not on the surface: while collapsed the
    // surface is translated out of the viewport entirely, and the peek still has to
    // receive the `mouseenter` that backs up the main process's cursor poll.
    <div
      className="relative h-full w-full cursor-grab select-none active:cursor-grabbing"
      onContextMenu={(event) => { event.preventDefault(); void window.metria.openWidgetMenu(); }}
      onMouseEnter={() => { if (autoHide) void window.metria.setWidgetHoverState(true); }}
      onMouseMove={() => { if (autoHide) void window.metria.setWidgetHoverState(true); }}
      onMouseLeave={() => { if (autoHide && !dragging.current) void window.metria.setWidgetHoverState(false); }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
    >
      <main
        className={`absolute inset-0 flex overflow-hidden border border-white/10 bg-black/90 ${vertical ? "flex-col py-3" : "flex-row px-3"}`}
        style={{ opacity: collapsed ? 0 : opacity, transform: collapsed ? offEdge : "translate3d(0, 0, 0)", transition: `transform ${slide} cubic-bezier(0.22, 1, 0.36, 1), opacity ${slide} ease-out`, borderRadius: shellRadius, boxShadow: "none", pointerEvents: collapsed ? "none" : "auto" }}
      >
        <section className={`flex min-h-0 min-w-0 flex-1 items-center justify-center gap-2 ${vertical ? "flex-col" : "flex-row"}`}>
          {displayed.map((provider, index) => (
            <div
              key={provider.kind}
              data-index={index}
              className={`flex shrink-0 cursor-pointer items-center justify-center gap-[3px] ${vertical ? "w-16 flex-col" : "h-16 flex-col"} ${size === "small" ? "scale-90" : size === "large" ? "scale-110" : ""}`}
              style={{ width: vertical ? 64 : WIDGET_ITEM_HEIGHT, height: vertical ? WIDGET_ITEM_HEIGHT : 64 }}
              onClick={() => { if (!moved.current) void window.metria.openDashboard(); }}
              onMouseEnter={() => { void window.metria.setProviderHover(index); }}
            >
              <Ring provider={provider} alert={settings.data?.alerts ?? { enabled: true, cautionThreshold: 40, warningThreshold: 65, criticalThreshold: 85, cautionColor: "#ffd60a", warningColor: "#ff9f0a", criticalColor: "#ff453a" }} />
              <span className="text-[11px] font-semibold leading-none text-white">
                {Math.round(clampPercent(primary(provider)))}%
              </span>
            </div>
          ))}
        </section>
      </main>
      <span
        className="pointer-events-none absolute flex items-center justify-center border border-white/10 bg-black/80 text-white/60"
        style={{ ...peekStyle, borderRadius: peekRadius, opacity: collapsed ? opacity : 0, transition: `opacity ${slide} ease-out` }}
        aria-hidden={!collapsed}
        aria-label="Hover to open widget"
      >
        <PeekChevron position={position} />
      </span>
    </div>
  );
}

function Root(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <Widget />
    </QueryClientProvider>
  );
}

document.body.addEventListener("mouseleave", () => { void window.metria.setProviderHover(null); });
createRoot(document.body).render(<Root />);
