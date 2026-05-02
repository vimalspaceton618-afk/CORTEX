// ============================================================
//  BIGROCK ASI — CybersecurityKing Layer
//  types.ts  ·  Shared contracts across all 10 engines
// ============================================================
export var ThreatLevel;
(function (ThreatLevel) {
    ThreatLevel[ThreatLevel["NONE"] = 0] = "NONE";
    ThreatLevel[ThreatLevel["LOW"] = 1] = "LOW";
    ThreatLevel[ThreatLevel["MODERATE"] = 2] = "MODERATE";
    ThreatLevel[ThreatLevel["HIGH"] = 3] = "HIGH";
    ThreatLevel[ThreatLevel["CRITICAL"] = 4] = "CRITICAL";
    ThreatLevel[ThreatLevel["EXISTENTIAL"] = 5] = "EXISTENTIAL";
})(ThreatLevel || (ThreatLevel = {}));
export var EngineID;
(function (EngineID) {
    EngineID["POLYMORPHIC_DEFENSE"] = "ENGINE_01_AI_ATTACK";
    EngineID["ZERO_DAY_PATCHER"] = "ENGINE_02_ZERO_DAY";
    EngineID["RANSOMWARE_GUARD"] = "ENGINE_03_RANSOMWARE";
    EngineID["PQC_AUDITOR"] = "ENGINE_04_QUANTUM";
    EngineID["SUPPLY_CHAIN_SCANNER"] = "ENGINE_05_SUPPLY_CHAIN";
    EngineID["DEEPFAKE_PROTOCOL"] = "ENGINE_06_DEEPFAKE";
    EngineID["IOT_VULN_SCANNER"] = "ENGINE_07_IOT";
    EngineID["INSIDER_THREAT"] = "ENGINE_08_INSIDER";
    EngineID["WORKFORCE_AI"] = "ENGINE_09_WORKFORCE";
    EngineID["CLOUD_CONFIG_AUDITOR"] = "ENGINE_10_CLOUD";
})(EngineID || (EngineID = {}));
export var ResponseAction;
(function (ResponseAction) {
    ResponseAction["MONITOR"] = "MONITOR";
    ResponseAction["ALERT"] = "ALERT";
    ResponseAction["ISOLATE"] = "ISOLATE";
    ResponseAction["BLOCK"] = "BLOCK";
    ResponseAction["PATCH"] = "PATCH";
    ResponseAction["ESCALATE"] = "ESCALATE";
    ResponseAction["SHUTDOWN"] = "EMERGENCY_SHUTDOWN";
    ResponseAction["AUDIT"] = "AUDIT";
    ResponseAction["TRAIN"] = "TRAIN";
    ResponseAction["REPORT"] = "REPORT";
})(ResponseAction || (ResponseAction = {}));
// ── Utility: create a typed ThreatSignal ────────────────────
export function createSignal(sourceEngine, level, vector, opts = {}) {
    return {
        id: `SIG-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        timestamp: new Date(),
        sourceEngine,
        level,
        confidence: opts.confidence ?? 0.75,
        vector,
        payload: opts.payload ?? {},
        iocs: opts.iocs ?? [],
        mitreAttack: opts.mitreAttack ?? [],
        actions: opts.actions ?? [ResponseAction.ALERT],
    };
}
