/** Domain types for Mise. Kept deliberately small — the memory service owns the hard parts. */

export type Sensitivity = "shareable" | "personal";

/** Where a piece of knowledge is allowed to live. */
export type Destination = "hosted" | "vault";

export interface RoutedLine {
  text: string;
  destination: Destination;
  sensitivity: Sensitivity;
  /** Which rule fired, so the demo can show its work. */
  reason: string;
}

export interface Turn {
  user_id: string;
  groups: string[];
  guest_id?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface Probe {
  query: string;
  user_id: string;
  scope: string;
  must_recall: string[];
  must_avoid: string[];
}

export interface Shift {
  n: number;
  date: string;
  covers: number;
  title: string;
  turns: Turn[];
  probes: Probe[];
  debrief: string;
}

export interface SeedConversation extends Turn {
  conv_id: string;
}

export interface GroupSpec {
  key: string;
  name: string;
  prompt: string | null;
}

/** A tool the service agent is about to run. Feeds the procedural tripwire. */
export interface ServiceAction {
  tool: string;
  args: Record<string, unknown>;
}

export interface ProbeResult {
  query: string;
  asker: string;
  fidelity: number;
  hits: string[];
  misses: string[];
  leaks: string[];
  directives: string[];
  recalledCount: number;
}

export interface ShiftResult {
  shift: number;
  date: string;
  title: string;
  covers: number;
  arm: Arm;
  fidelity: number;
  /** Distinct third-party medical facts this architecture has sent to the hosted service. */
  exposed: number;
  directivesFired: number;
  probes: ProbeResult[];
}

/** The three ways to run the same service, for the A/B/C. */
export type Arm = "blind" | "pooled" | "mise";

export interface MemoryRow {
  id: string;
  type: string;
  text: string;
  user_id?: string | null;
  group_ids?: string[];
  score?: number | null;
  created_at?: string | null;
  details?: Record<string, unknown>;
}
