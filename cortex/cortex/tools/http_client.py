"""HTTP Client Tool — Full REST client for agents."""

import json
from .base import BaseTool
from .base_models import ToolCallResult


class HTTPClient(BaseTool):
    """Full HTTP client: GET/POST/PUT/DELETE/PATCH with headers, auth, body."""

    name = "http_client"
    description = "Make HTTP requests (GET/POST/PUT/DELETE) with headers and body"
    language = "json"

    async def execute(self, input_data: dict) -> ToolCallResult:
        import httpx, time
        method = input_data.get("method", "GET").upper()
        url = input_data.get("url", "")
        headers = input_data.get("headers", {})
        body = input_data.get("body", None)
        params = input_data.get("params", {})
        timeout = input_data.get("timeout", 15)

        if not url:
            return ToolCallResult(tool_name=self.name, success=False, stderr="No URL provided", exit_code=1)

        start = time.time()
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
                resp = await client.request(method, url, headers=headers, json=body if body else None, params=params)
                duration = (time.time() - start) * 1000

                # Format output
                parts = [f"HTTP {resp.status_code} {resp.reason_phrase}", f"URL: {resp.url}"]
                parts.append(f"Headers: {dict(list(resp.headers.items())[:10])}")
                try:
                    data = resp.json()
                    parts.append(f"Body:\n{json.dumps(data, indent=2)[:3000]}")
                except Exception:
                    parts.append(f"Body:\n{resp.text[:3000]}")

                return ToolCallResult(
                    tool_name=self.name, success=resp.status_code < 400,
                    stdout="\n".join(parts), exit_code=0 if resp.status_code < 400 else resp.status_code,
                    duration_ms=duration,
                )
        except Exception as e:
            return ToolCallResult(tool_name=self.name, success=False, stderr=str(e), exit_code=1,
                                  duration_ms=(time.time() - start) * 1000)
