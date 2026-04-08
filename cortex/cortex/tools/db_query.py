"""Database Query Tool — SQL execution against SQLite/PostgreSQL."""

import sqlite3, json
from pathlib import Path
from .base import BaseTool
from .base_models import ToolCallResult


class DBQuery(BaseTool):
    """Execute SQL queries against SQLite (built-in) or connection strings."""

    name = "db_query"
    description = "Run SQL queries against databases (SQLite built-in)"
    language = "sql"

    async def execute(self, input_data: dict) -> ToolCallResult:
        query = input_data.get("query", input_data.get("sql", ""))
        db_path = input_data.get("db_path", input_data.get("database", ""))

        if not query.strip():
            return ToolCallResult(tool_name=self.name, success=False, stderr="No query", exit_code=1)
        if not db_path:
            return ToolCallResult(tool_name=self.name, success=False, stderr="No database path", exit_code=1)

        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(query)

            if query.strip().upper().startswith("SELECT") or query.strip().upper().startswith("PRAGMA"):
                rows = cursor.fetchall()
                if not rows:
                    return ToolCallResult(tool_name=self.name, success=True, stdout="(empty result set)")
                columns = [desc[0] for desc in cursor.description]
                lines = [" | ".join(columns), "-" * (len(" | ".join(columns)))]
                for row in rows[:100]:
                    lines.append(" | ".join(str(row[c]) for c in columns))
                lines.append(f"\n({len(rows)} rows)")
                return ToolCallResult(tool_name=self.name, success=True, stdout="\n".join(lines))
            else:
                conn.commit()
                return ToolCallResult(tool_name=self.name, success=True,
                                      stdout=f"OK — {cursor.rowcount} rows affected")
        except Exception as e:
            return ToolCallResult(tool_name=self.name, success=False, stderr=str(e), exit_code=1)
        finally:
            conn.close()
