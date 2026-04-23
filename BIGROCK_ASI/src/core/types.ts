/**
 * BIGROCK_v1 - NeuroSymbolic Superintendent Architecture
 * -------------------------------------------------------
 * Module: type definitions for the entire ASI
 * These types enforce strict contracts across ALL modules.
 */

// ─── Core Cognition Types ─────────────────────────────────────────────────────

/** The fundamental "thought" unit. Every reasoning step inside Bigrock is a Thought. */
export type ThinkMode = 'symbolic' | 'heuristic' | 'predictive' | 'meta';

export interface Thought {
    id: string;
    timestamp: number;
    mode: ThinkMode;
    raw_input: string;
    parsed_intent: ParsedIntent;
    result: ThoughtResult | null;
    confidence: number; // 0.0 → 1.0. Symbolic mode ALWAYS produces 1.0.
    execution_time_ms: number;
}

export interface ParsedIntent {
    domain: CognitiveDomain;
    operation: string;
    parameters: Record<string, any>;
    requires_proof: boolean;
    security_level: SecurityLevel;
}

export type CognitiveDomain =
    | 'mathematics'
    | 'physics'
    | 'chemistry'
    | 'logic'
    | 'system'
    | 'network'
    | 'memory'
    | 'language'
    | 'synthesis'
    | 'auto'
    | 'unknown'
    // Self-Absorbing domains (LLM Devourer routes these)
    | 'reasoning'
    | 'cybersecurity'
    | 'code'
    | 'science'
    | 'creative';

export type SecurityLevel = 'read_only' | 'compute' | 'write' | 'kernel' | 'root';

export interface ThoughtResult {
    type: 'proof' | 'computation' | 'string' | 'error';
    value: any;
    proof_trace?: string[];   // Step-by-step logical derivation
    confidence: number;
}

// ─── Security Types ────────────────────────────────────────────────────────────

export interface SecurityAuditLog {
    threat_id: string;
    timestamp: number;
    threat_type: ThreatType;
    severity: 'low' | 'medium' | 'high' | 'critical';
    payload_hash: string;
    blocked: boolean;
    action_taken: string;
}

export type ThreatType =
    | 'prompt_injection'
    | 'privilege_escalation'
    | 'infinite_loop'
    | 'memory_overflow'
    | 'unauthorized_tool_access'
    | 'data_exfiltration_attempt'
    | 'jailbreak_attempt'
    | 'null_byte_injection'
    | 'syscall_interception_attempt';

// ─── Memory Types ──────────────────────────────────────────────────────────────

export interface MemoryCell {
    key: string;
    value: any;
    type: 'constant' | 'variable' | 'proof' | 'episodic';
    write_time: number;
    ttl?: number; // Time-to-live in ms. If unset, permanent.
    encrypted: boolean;
    access_count: number;
}

// ─── Neuro-Bridge Types ────────────────────────────────────────────────────────

export interface BridgeDecision {
    route: 'symbolic_engine' | 'language_model' | 'system_kernel' | 'memory_core';
    confidence: number;
    reasoning: string;
    fallback?: BridgeDecision;
}
