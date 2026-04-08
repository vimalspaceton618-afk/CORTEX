"""Technical Topology Map data structures for King of Browser outputs."""

from dataclasses import dataclass, asdict
from typing import List, Dict, Any, Optional
from datetime import datetime


@dataclass
class CodeFile:
    """Represents a source code file."""
    path: str
    language: str
    content: str
    functions: List[str]
    classes: List[str]
    imports: List[str]
    line_count: int


@dataclass
class DNSRecord:
    """DNS record information."""
    record_type: str  # A, AAAA, CNAME, MX, TXT, etc.
    name: str
    value: str
    ttl: Optional[int] = None


@dataclass
class APIEndpoint:
    """Discovered API endpoint."""
    url: str
    method: str  # GET, POST, etc.
    description: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    response_schema: Optional[Dict[str, Any]] = None


@dataclass
class TechnicalTopologyMap:
    """
    Structured output from King of Browser.
    Contains verified technical data from source code, DNS, URLs.
    """
    source_url: str
    source_type: str  # 'github', 'website', 'dns', 'api_docs'
    timestamp: str

    # Extracted data
    code_files: List[CodeFile]
    dns_records: List[DNSRecord]
    api_endpoints: List[APIEndpoint]
    documentation_snippets: List[Dict[str, str]]  # [{'context': str, 'snippet': str}]

    # Metadata
    raw_content_length: int
    processing_time_ms: float
    errors: List[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TechnicalTopologyMap':
        """Create from dictionary."""
        return cls(**data)
