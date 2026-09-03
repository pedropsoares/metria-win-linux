export type ProviderKind = "Claude" | "Codex" | "OpenCode Go" | "Cursor";

export interface UsageWindow {
  title: string;
  percent: number;
  resetDate: string | null;
  /** What the window costs, in cents, when the provider measures money rather than a
   * bare percentage (Cursor). Present as a pair or not at all. */
  usedCents?: number;
  limitCents?: number;
}

/** How a window carrying spend amounts prints its magnitude. */
export type SpendDisplay = "percent" | "dollars" | "both";

export interface ProviderUsage {
  kind: ProviderKind;
  accountLabel: string | null;
  windows: UsageWindow[];
  updatedAt: string | null;
  error: string | null;
  available: boolean;
  setupHint: string;
}

export type WidgetPosition = "top" | "bottom" | "left" | "right";
export type WidgetSize = "small" | "medium" | "large";
export type WidgetBehavior = "pinned" | "auto-hide";

export interface AlertSettings {
  enabled: boolean;
  cautionThreshold: number;
  warningThreshold: number;
  criticalThreshold: number;
  cautionColor: string;
  warningColor: string;
  criticalColor: string;
}

export interface AppSettings {
  refreshIntervalSeconds: number;
  spendDisplay: SpendDisplay;
  enabledProviders: ProviderKind[];
  widgetYOffset: number;
  widgetAlongEdgeOffset: number;
  showWidget: boolean;
  showTray: boolean;
  showAccountLabels: boolean;
  widgetBehavior: WidgetBehavior;
  widgetPosition: WidgetPosition;
  widgetSize: WidgetSize;
  widgetOpacity: number;
  widgetDisplayId: string | null;
  providerSource: Partial<Record<ProviderKind, ProviderSourceChoice>>;
  hiddenUsageWindowTitles: Partial<Record<ProviderKind, string[]>>;
  alerts: AlertSettings;
  ntfyServer: string;
  localServerPort: number;
  customPwaUrl: string;
}

/** Everything the dashboard needs to show the pairing pane: the QR code and phrase a
 * phone pairs with, plus the addresses that code points at. */
export interface PairingInfo {
  words: string[];
  link: string;
  qrDataUrl: string;
  localUrl: string | null;
  ntfyServer: string;
  localServerPort: number;
  customPwaUrl: string;
}

export interface CardShowPayload {
  index: number;
  kind: ProviderKind;
}

export interface MetriaApi {
  getUsage(): Promise<ProviderUsage[]>;
  refresh(): Promise<ProviderUsage[]>;
  getSettings(): Promise<AppSettings>;
  openDashboard(): Promise<void>;
  openWidgetMenu(): Promise<void>;
  setProviderHover(index: number | null): Promise<void>;
  resizeCard(height: number): Promise<void>;
  onSettingsChanged(callback: () => void): void;
  onUsageChanged(callback: () => void): void;
  onOpenSettings(callback: () => void): void;
  onCardShow(callback: (payload: CardShowPayload) => void): void;
  onCardHide(callback: () => void): void;
  onWidgetReveal(callback: () => void): void;
  onWidgetCollapse(callback: () => void): void;
  setWidgetHoverState(hovered: boolean): Promise<void>;
  setProviderEnabled(kind: ProviderKind, enabled: boolean): Promise<AppSettings>;
  reconnect(kind: ProviderKind): Promise<{ command: string; message: string }>;
  setWidgetYOffset(offsetY: number): Promise<AppSettings>;
  setWidgetPreferences(preferences: Partial<Pick<AppSettings, "showWidget" | "showTray" | "showAccountLabels" | "widgetBehavior" | "widgetPosition" | "widgetSize" | "widgetOpacity" | "widgetDisplayId" | "alerts">>): Promise<AppSettings>;
  setWindowVisible(kind: ProviderKind, title: string, visible: boolean): Promise<AppSettings>;
  diagnose(kind: ProviderKind): Promise<string>;
  getLoginItemStatus(): Promise<LoginItemStatus>;
  setLaunchAtLogin(enabled: boolean): Promise<LoginItemStatus>;
  getAppInfo(): Promise<AppInfo>;
  getDisplays(): Promise<DisplayInfo[]>;
  checkUpdates(): Promise<UpdateCheckResult>;
  installUpdate(): Promise<void>;
  uninstall(): Promise<UninstallResult>;
  quit(): Promise<void>;
  setRefreshInterval(seconds: number): Promise<AppSettings>;
  setSpendDisplay(display: SpendDisplay): Promise<AppSettings>;
  getProviderSources(): Promise<ProviderSourceInfo[]>;
  setProviderSource(kind: ProviderKind, source: ProviderSourceChoice): Promise<AppSettings>;
  getPairing(): Promise<PairingInfo>;
  regeneratePairing(): Promise<PairingInfo>;
  setNtfyServer(server: string): Promise<PairingInfo>;
  setLocalServerPort(port: number): Promise<PairingInfo>;
  setCustomPwaUrl(url: string): Promise<PairingInfo>;
  copyText(text: string): Promise<void>;
  onPairingChanged(callback: () => void): void;
}

export interface DisplayInfo { id: string; label: string; }

export interface LoginItemStatus { available: boolean; enabled: boolean; message: string; }

export interface AppInfo {
  version: string;
  platform: string;
  packaged: boolean;
  dataPath: string;
}

export interface UpdateCheckResult {
  status: "up-to-date" | "downloaded" | "unavailable" | "error";
  message: string;
}

export interface UninstallResult {
  opened: boolean;
  message: string;
}

export interface ProviderSourceChoice {
  location: "host" | "wsl";
  distro?: string;
}

export interface WslPresence {
  distro: string;
  present: boolean;
}

export interface ProviderSourceInfo {
  kind: ProviderKind;
  host: boolean;
  wsl: WslPresence[];
  source: ProviderSourceChoice | null;
  needsChoice: boolean;
}

export const ALL_PROVIDER_KINDS: ProviderKind[] = ["Claude", "Codex", "OpenCode Go", "Cursor"];

export function isProviderKind(value: unknown): value is ProviderKind {
  return value === "Claude" || value === "Codex" || value === "OpenCode Go" || value === "Cursor";
}

export const PROVIDER_LOGOS: Record<ProviderKind, string> = {
  "Claude": "claude-logo.png",
  "Codex": "codex-logo.png",
  "OpenCode Go": "opencode-logo.png",
  "Cursor": "cursor-logo.png"
};

export function providerShortLabel(kind: ProviderKind): string {
  return kind === "OpenCode Go" ? "Go" : kind;
}

export function isSpendDisplay(value: unknown): value is SpendDisplay {
  return value === "percent" || value === "dollars" || value === "both";
}

/** Cursor reports cents. Whole dollars drop the decimals so the common case reads as
 * money ("$130") instead of accounting ("$130.00"). */
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars.toFixed(0) : dollars.toFixed(2)}`;
}

/** The money half of a window's readout — "$130 / $250" — or null for a provider that
 * only ever reports a percentage. */
export function spendText(window: UsageWindow): string | null {
  return typeof window.usedCents === "number" && typeof window.limitCents === "number"
    ? `${formatCents(window.usedCents)} / ${formatCents(window.limitCents)}`
    : null;
}

/** Which halves of the readout a window shows. A window without amounts always keeps its
 * percentage, so choosing "dollars" never blanks out Claude, Codex, or OpenCode Go. */
export function usageParts(window: UsageWindow, display: SpendDisplay): { percent: boolean; spend: string | null } {
  const spend = spendText(window);
  if (!spend) return { percent: true, spend: null };
  return { percent: display !== "dollars", spend: display === "percent" ? null : spend };
}

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function gaugeColor(percent: number): string {
  return percent >= 85 ? "#ff453a" : percent >= 65 ? "#ff9f0a" : percent >= 40 ? "#ffd60a" : "#30d158";
}

export function statusDotColor(hasError: boolean): string {
  return hasError ? "#ff9f0a" : "#30d158";
}

export const WIDGET_ITEM_HEIGHT = 52;
/** Thickness of the auto-hide widget window once it collapses to the peek pill hugging
 * the screen edge. Sized to still fit the reveal chevron, mirroring the macOS notch's
 * 18pt `hiddenWidth`. */
export const WIDGET_COLLAPSED_THICKNESS = 14;
/** Length of the peek pill along the edge. The collapsed window is only this long,
 * centred on the rail, rather than running the rail's whole extent. */
export const WIDGET_PEEK_EXTENT = 80;
/** How far the cursor hot zone grows past the peek, on every side but the screen edge,
 * so the reveal target isn't pixel-perfect. */
export const WIDGET_HOT_ZONE_GRAB = 6;
/** Debounce before the widget collapses again once the cursor leaves it. Matches the
 * macOS notch's 0.25s hover-collapse delay. */
export const WIDGET_COLLAPSE_DELAY_MS = 250;
/** Dwell time before a cursor resting in the hot zone reveals the widget, so merely
 * sweeping past the screen edge doesn't pop it open. */
export const WIDGET_REVEAL_DWELL_MS = 100;
/** How far the revealed widget and its card are grown when deciding whether the cursor
 * is still "on" them. Must be at least the widget-to-card spacing, or crossing that gap
 * would read as leaving and collapse the widget mid-interaction. */
export const WIDGET_KEEP_OPEN_MARGIN = 12;
/** Poll interval for the cursor-position fallback that detects the hot zone even when
 * the window manager fails to deliver DOM hover events. */
export const WIDGET_CURSOR_POLL_MS = 100;
/** Duration of the reveal/collapse slide. The renderer animates the surface with a CSS
 * transform for exactly this long; the main process only resizes the window once, after
 * the slide-out has finished. */
export const WIDGET_SLIDE_MS = 160;
export const CARD_WIDTH = 316;
export const DEFAULT_WIDGET_Y_OFFSET = 12;
export const DEFAULT_REFRESH_INTERVAL_SECONDS = 300;
export const DEFAULT_SPEND_DISPLAY: SpendDisplay = "both";
export const DEFAULT_NTFY_SERVER = "https://ntfy.sh";
export const DEFAULT_LOCAL_SERVER_PORT = 8973;
/** The hosted PWA the native app pairs against by default; an empty setting pairs
 * through this machine's own LAN server instead. */
export const DEFAULT_PWA_URL = "https://metria-pwa.yuriramos2406.workers.dev";
export const PRESENCE_CACHE_TTL_MS = 30_000;
