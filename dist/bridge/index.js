/**
 * CORTEX v5.0 — Unified Cross-Language Bridge Manager
 * Lazy-initializes each language bridge on first use.
 * © 2026 SpaceTon
 */
import { PythonBridge } from './PythonBridge.js';
let _python = null;
export function getPythonBridge() {
    if (!_python)
        _python = new PythonBridge();
    return _python;
}
export async function getBridgeStatus() {
    return {
        python: getPythonBridge().isReady()
    };
}
export function shutdownAllBridges() {
    _python?.stop();
    _python = null;
}
export { PythonBridge };
