"""Benchmark Runner — Time and profile code execution."""

import sys, time
from .base import BaseTool
from .base_models import ToolCallResult


class BenchRunner(BaseTool):
    """Benchmark code: multi-run timing, memory tracking, comparison."""

    name = "bench_runner"
    description = "Benchmark code execution (timing, memory, comparison)"
    language = "python"

    async def execute(self, input_data: dict) -> ToolCallResult:
        code = input_data.get("code", "")
        runs = min(input_data.get("runs", 5), 100)
        if not code.strip():
            return ToolCallResult(tool_name=self.name, success=False, stderr="No code", exit_code=1)

        bench_code = f'''
import time, statistics, tracemalloc, sys
code = {repr(code)}
runs = {runs}
times = []
tracemalloc.start()
for i in range(runs):
    start = time.perf_counter()
    exec(code)
    times.append((time.perf_counter() - start) * 1000)
current, peak = tracemalloc.get_traced_memory()
tracemalloc.stop()
times.sort()
print(f"Runs: {{runs}}")
print(f"Min:    {{times[0]:.3f}} ms")
print(f"Max:    {{times[-1]:.3f}} ms")
print(f"Mean:   {{statistics.mean(times):.3f}} ms")
print(f"Median: {{statistics.median(times):.3f}} ms")
if runs >= 20:
    p95_idx = int(0.95 * len(times))
    print(f"P95:    {{times[p95_idx]:.3f}} ms")
print(f"Memory: {{current / 1024:.1f}} KB current, {{peak / 1024:.1f}} KB peak")
'''
        return self._run_subprocess([sys.executable, "-c", bench_code], timeout=self.timeout)
