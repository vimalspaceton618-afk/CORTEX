// ============================================================
//  BIGROCK ASI — CybersecurityKing Layer
//  types.ts  ·  Shared contracts across all 10 engines
// ============================================================

export enum ThreatLevel {
  NONE      = 0,
  LOW       = 1,
  MODERATE  = 2,
  HIGH      = 3,
  CRITICAL  = 4,
  EXISTENTIAL = 5,     // reserved for quantum / APT scenarios
}

export enum EngineID {
  POLYMORPHIC_DEFENSE   = "ENGINE_01_AI_ATTACK",
  ZERO_DAY_PATCHER      = "ENGINE_02_ZERO_DAY",
  RANSOMWARE_GUARD      = "ENGINE_03_RANSOMWARE",
  PQC_AUDITOR           = "ENGINE_04_QUANTUM",
  SUPPLY_CHAIN_SCANNER  = "ENGINE_05_SUPPLY_CHAIN",
  DEEPFAKE_PROTOCOL     = "ENGINE_06_DEEPFAKE",
  IOT_VULN_SCANNER      = "ENGINE_07_IOT",
  INSIDER_THREAT        = "ENGINE_08_INSIDER",
  WORKFORCE_AI          = "ENGINE_09_WORKFORCE",
  CLOUD_CONFIG_AUDITOR  = "ENGINE_10_CLOUD",
}

export enum ResponseAction {
  MONITOR       = "MONITOR",
  ALERT         = "ALERT",
  ISOLATE       = "ISOLATE",
  BLOCK         = "BLOCK",
  PATCH         = "PATCH",
  ESCALATE      = "ESCALATE",
  SHUTDOWN      = "EMERGENCY_SHUTDOWN",
  AUDIT         = "AUDIT",
  TRAIN         = "TRAIN",
  REPORT        = "REPORT",
}

// ── Core signal passed between engines ──────────────────────
export interface ThreatSignal {
  id:          string;
  timestamp:   Date;
  sourceEngine: EngineID;
  level:       ThreatLevel;
  confidence:  number;           // 0.0 – 1.0
  vector:      string;           // human-readable threat vector
  payload:     Record<string, unknown>;
  iocs:        string[];         // Indicators of Compromise
  mitreAttack?: string[];        // MITRE ATT&CK technique IDs
  actions:     ResponseAction[];
}

// ── Every engine must implement this contract ────────────────
export interface CyberEngine {
  readonly id:      EngineID;
  readonly name:    string;
  readonly version: string;

  /** Boot the engine and validate its configuration */
  initialize(): Promise<void>;

  /** Primary analysis entry point — returns zero or more signals */
  analyze(context: AnalysisContext): Promise<ThreatSignal[]>;

  /** React to a signal emitted by another engine */
  onSignal(signal: ThreatSignal): Promise<void>;

  /** Health-check: returns true if engine is operational */
  healthCheck(): Promise<boolean>;

  /** Graceful teardown */
  shutdown(): Promise<void>;
}

// ── Context fed into every engine.analyze() call ────────────
export interface AnalysisContext {
  sessionId:       string;
  orgId:           string;
  timestamp:       Date;
  networkSnapshot: NetworkSnapshot;
  assetInventory:  AssetRecord[];
  userActivity:    UserActivityRecord[];
  externalFeeds:   ThreatFeedEntry[];
  priorSignals:    ThreatSignal[];
}

export interface NetworkSnapshot {
  inboundTrafficGbps:  number;
  outboundTrafficGbps: number;
  activeConnections:   number;
  anomalyScore:        number;   // 0–100, computed by perimeter sensors
  dnsQueryCount:       number;
  tlsVersionDistribution: Record<string, number>;
  openPorts:           number[];
}

export interface AssetRecord {
  assetId:      string;
  type:         "server" | "endpoint" | "iot" | "container" | "saas" | "cloud-resource";
  os:           string;
  patchLevel:   string;   // ISO date of last patch
  criticality:  1 | 2 | 3 | 4 | 5;
  exposedToInternet: boolean;
  tags:         string[];
}

export interface UserActivityRecord {
  userId:        string;
  role:          string;
  loginTime:     Date;
  actions:       string[];
  dataVolumeGB:  number;
  privileged:    boolean;
  anomalyScore:  number;  // 0–100
  deviceId:      string;
  geoLocation:   string;
}

export interface ThreatFeedEntry {
  source:    string;   // e.g. "CERT-In", "CISA", "MISP"
  ioc:       string;
  iocType:   "ip" | "domain" | "hash" | "cve" | "pattern";
  severity:  ThreatLevel;
  publishedAt: Date;
}

// ── Engine status reported to the BIGROCK orchestrator ──────
export interface EngineStatus {
  engineId:    EngineID;
  healthy:     boolean;
  lastRun:     Date;
  signalCount: number;
  errorCount:  number;
  latencyMs:   number;
}

// ── Aggregate BIGROCK brain output ──────────────────────────
export interface BigrockReport {
  sessionId:    string;
  generatedAt:  Date;
  overallLevel: ThreatLevel;
  riskScore:    number;       // 0–100 composite
  signals:      ThreatSignal[];
  engineStatus: EngineStatus[];
  topActions:   ResponseAction[];
  summary:      string;
}

// ── Utility: create a typed ThreatSignal ────────────────────
export function createSignal(
  sourceEngine: EngineID,
  level: ThreatLevel,
  vector: string,
  opts: Partial<Omit<ThreatSignal, "id" | "timestamp" | "sourceEngine" | "level" | "vector">> = {}
): ThreatSignal {
  return {
    id:           `SIG-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    timestamp:    new Date(),
    sourceEngine,
    level,
    confidence:   opts.confidence  ?? 0.75,
    vector,
    payload:      opts.payload     ?? {},
    iocs:         opts.iocs        ?? [],
    mitreAttack:  opts.mitreAttack ?? [],
    actions:      opts.actions     ?? [ResponseAction.ALERT],
  };
}
