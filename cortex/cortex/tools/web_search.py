"""Web Search Tool — Wraps King of Browser for agent access."""

from .base import BaseTool
from .base_models import ToolCallResult


class WebSearchTool(BaseTool):
    """Search the web and extract technical content via King of Browser."""

    name = "web_search"
    description = "Search web, scrape URLs, query GitHub, resolve DNS"
    language = "text"

    def __init__(self, config=None, king=None):
        super().__init__(config)
        self.king = king

    async def execute(self, input_data: dict) -> ToolCallResult:
        target = input_data.get("target", input_data.get("url", input_data.get("query", "")))
        target_type = input_data.get("target_type", "auto")

        if not target:
            return ToolCallResult(tool_name=self.name, success=False, stderr="No target provided", exit_code=1)

        if not self.king:
            return ToolCallResult(tool_name=self.name, success=False, stderr="King of Browser not initialized", exit_code=1)

        try:
            result = await self.king.analyze(target, target_type=target_type)
            parts = []
            parts.append(f"Source: {result.source_url} ({result.source_type})")
            if result.code_files:
                parts.append(f"Code files: {len(result.code_files)}")
                for cf in result.code_files[:3]:
                    parts.append(f"  - {cf.path} ({cf.line_count} lines)")
            if result.dns_records:
                parts.append(f"DNS records: {len(result.dns_records)}")
                for r in result.dns_records[:5]:
                    parts.append(f"  - {r.record_type} {r.name} → {r.value}")
            if result.documentation_snippets:
                parts.append(f"Documentation snippets: {len(result.documentation_snippets)}")
                for s in result.documentation_snippets[:3]:
                    parts.append(f"  - {s.get('snippet', '')[:150]}...")
            if result.api_endpoints:
                parts.append(f"API endpoints: {len(result.api_endpoints)}")
                for ep in result.api_endpoints[:5]:
                    parts.append(f"  - {ep.method} {ep.url}")

            return ToolCallResult(
                tool_name=self.name, success=True,
                stdout="\n".join(parts),
                duration_ms=result.processing_time_ms,
            )
        except Exception as e:
            return ToolCallResult(tool_name=self.name, success=False, stderr=str(e), exit_code=1)
