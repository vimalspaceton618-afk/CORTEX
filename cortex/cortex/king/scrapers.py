"""Scrapers for extracting technical data from various sources."""

import asyncio
import aiohttp
import dns
import requests
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse
import re
import json
from datetime import datetime

from .topology import CodeFile, DNSRecord, APIEndpoint, TechnicalTopologyMap


class GitHubScraper:
    """Scrapes GitHub repositories for source code."""

    GITHUB_API_BASE = "https://api.github.com"

    def __init__(self, token: Optional[str] = None):
        self.token = token
        self.headers = {'Accept': 'application/vnd.github.v3+json'}
        if token:
            self.headers['Authorization'] = f'token {token}'

    async def scrape_repo(self, owner: str, repo: str, branch: str = "main") -> List[CodeFile]:
        """Fetch all code files from a GitHub repository."""
        files = []

        async with aiohttp.ClientSession(headers=self.headers) as session:
            try:
                # First, try to get repository's default branch if not specified
                if branch == "main":
                    default_branch = await self._get_default_branch(session, owner, repo)
                    if default_branch:
                        branch = default_branch
                        print(f"[KING] Using default branch: {branch}")

                # Get repository tree
                tree_url = f"{self.GITHUB_API_BASE}/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
                print(f"[KING] Fetching tree from {tree_url}")
                async with session.get(tree_url) as resp:
                    if resp.status != 200:
                        error_text = await resp.text()
                        print(f"[KING] Tree fetch failed: {resp.status} - {error_text[:200]}")
                        return []
                    tree_data = await resp.json()

                tree_items = tree_data.get('tree', [])
                print(f"[KING] Tree has {len(tree_items)} items")

                # Filter code files
                code_blobs = [item for item in tree_items if item['type'] == 'blob' and self._is_code_file(item['path'])]
                print(f"[KING] Found {len(code_blobs)} code files to fetch")

                # Limit to first 50 files for speed (configurable)
                code_blobs = code_blobs[:50]

                # Fetch each file content
                tasks = []
                for item in code_blobs:
                    tasks.append(self._fetch_file(session, owner, repo, item['path'], item['sha']))

                results = await asyncio.gather(*tasks, return_exceptions=True)
                for result in results:
                    if isinstance(result, CodeFile):
                        files.append(result)
                    elif isinstance(result, Exception):
                        print(f"[WARN] Failed to fetch file: {result}")

            except Exception as e:
                print(f"[ERROR] GitHub scraper failed: {e}")
                import traceback
                traceback.print_exc()

        print(f"[KING] Successfully loaded {len(files)} code files")
        return files

    async def _get_default_branch(self, session: aiohttp.ClientSession, owner: str, repo: str) -> Optional[str]:
        """Get repository's default branch."""
        try:
            repo_url = f"{self.GITHUB_API_BASE}/repos/{owner}/{repo}"
            async with session.get(repo_url) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data.get('default_branch', 'main')
        except Exception as e:
            print(f"[WARN] Could not get default branch: {e}")
        return None

    async def _fetch_file(self, session: aiohttp.ClientSession, owner: str, repo: str, path: str, sha: str) -> CodeFile:
        """Fetch individual file content."""
        content_url = f"{self.GITHUB_API_BASE}/repos/{owner}/{repo}/git/blobs/{sha}"
        async with session.get(content_url) as resp:
            if resp.status != 200:
                raise Exception(f"Failed to fetch file {path}: {resp.status}")
            data = await resp.json()
            content = self._decode_content(data['content'], data['encoding'])

        language = self._detect_language(path)
        functions, classes, imports = self._analyze_code(content, language)

        return CodeFile(
            path=path,
            language=language,
            content=content,
            functions=functions,
            classes=classes,
            imports=imports,
            line_count=len(content.splitlines())
        )

    def _decode_content(self, content: str, encoding: str) -> str:
        """Decode base64 or other encoded content."""
        if encoding == 'base64':
            import base64
            return base64.b64decode(content).decode('utf-8', errors='ignore')
        return content

    def _is_code_file(self, path: str) -> bool:
        """Check if file extension indicates source code."""
        code_extensions = {
            '.py', '.js', '.ts', '.java', '.c', '.cpp', '.h', '.hpp',
            '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.scala',
            '.sh', '.bash', '.sql', '.html', '.css', '.scss', '.json', '.yaml', '.yml'
        }
        return any(path.endswith(ext) for ext in code_extensions)

    def _detect_language(self, path: str) -> str:
        """Detect programming language from file extension."""
        ext_to_lang = {
            '.py': 'python',
            '.js': 'javascript',
            '.ts': 'typescript',
            '.java': 'java',
            '.c': 'c',
            '.cpp': 'cpp',
            '.h': 'c',
            '.hpp': 'cpp',
            '.go': 'go',
            '.rs': 'rust',
            '.rb': 'ruby',
            '.php': 'php',
            '.swift': 'swift',
            '.kt': 'kotlin',
            '.scala': 'scala',
            '.sh': 'bash',
            '.bash': 'bash',
            '.sql': 'sql',
            '.html': 'html',
            '.css': 'css',
            '.scss': 'scss',
            '.json': 'json',
            '.yaml': 'yaml',
            '.yml': 'yaml'
        }
        for ext, lang in ext_to_lang.items():
            if path.endswith(ext):
                return lang
        return 'unknown'

    def _analyze_code(self, content: str, language: str) -> tuple:
        """Extract functions, classes, imports from code."""
        functions = []
        classes = []
        imports = []

        lines = content.splitlines()

        if language == 'python':
            for line in lines:
                line = line.strip()
                if line.startswith('def '):
                    func_name = line.split('(')[0].replace('def ', '')
                    functions.append(func_name)
                elif line.startswith('class '):
                    class_name = line.split('(')[0].replace('class ', '').split(':')[0]
                    classes.append(class_name)
                elif line.startswith('import ') or line.startswith('from '):
                    imports.append(line)

        elif language in ['javascript', 'typescript']:
            for line in lines:
                line = line.strip()
                if line.startswith('function ') or '=>' in line:
                    functions.append(line)
                elif line.startswith('class '):
                    classes.append(line.split(' ')[1])
                elif line.startswith('import '):
                    imports.append(line)

        # Add more language detection as needed

        return functions, classes, imports


class DNSResolver:
    """Resolves DNS records for a domain."""

    @staticmethod
    async def resolve(domain: str, record_types: List[str] = None) -> List[DNSRecord]:
        """Query DNS records for a domain."""
        if record_types is None:
            record_types = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS']

        records = []

        try:
            import dns.resolver
            resolver = dns.resolver.Resolver()

            for rtype in record_types:
                try:
                    answers = resolver.resolve(domain, rtype)
                    for rdata in answers:
                        records.append(DNSRecord(
                            record_type=rtype,
                            name=domain,
                            value=str(rdata),
                            ttl=rdata.ttl if hasattr(rdata, 'ttl') else None
                        ))
                except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
                    continue
                except Exception as e:
                    print(f"[WARN] DNS query {rtype} failed for {domain}: {e}")

        except ImportError:
            # Fallback to subprocess + dig if dnspython not installed
            import subprocess
            for rtype in record_types:
                try:
                    result = subprocess.run(['dig', '+short', domain, rtype],
                                            capture_output=True, text=True, timeout=5)
                    if result.stdout:
                        for line in result.stdout.strip().split('\n'):
                            records.append(DNSRecord(
                                record_type=rtype,
                                name=domain,
                                value=line.strip()
                            ))
                except Exception as e:
                    print(f"[WARN] dig {rtype} failed: {e}")

        return records


class URLScraper:
    """Scrapes a URL and extracts content."""

    def __init__(self, user_agent: str = "CORTEX-King/1.0"):
        self.user_agent = user_agent

    async def scrape(self, url: str) -> Dict[str, Any]:
        """Scrape a URL and return extracted content."""
        async with aiohttp.ClientSession(headers={'User-Agent': self.user_agent}) as session:
            async with session.get(url, timeout=30) as resp:
                if resp.status != 200:
                    raise Exception(f"Failed to fetch {url}: {resp.status}")
                html = await resp.text()

        # Simple extraction: look for code blocks, pre tags, and text
        documentation_snippets = []

        # Extract <pre><code> blocks
        import re
        code_blocks = re.findall(r'<pre[^>]*><code[^>]*>(.*?)</code></pre>', html, re.DOTALL | re.IGNORECASE)
        for i, block in enumerate(code_blocks):
            documentation_snippets.append({
                'type': 'code_block',
                'index': i,
                'snippet': block[:1000]  # Limit size
            })

        # Extract text content (remove HTML tags)
        text_content = re.sub(r'<[^>]+>', ' ', html)
        text_content = ' '.join(text_content.split())[:5000]

        return {
            'url': url,
            'text_content': text_content,
            'code_blocks': code_blocks,
            'documentation_snippets': documentation_snippets
        }


class APIDiscoverer:
    """Discovers and extracts API specifications from documentation."""

    @staticmethod
    def extract_openapi_from_text(text: str) -> Optional[Dict[str, Any]]:
        """Try to extract OpenAPI/Swagger JSON from text."""
        import json
        import re

        # Look for JSON objects that look like OpenAPI
        json_match = re.search(r'(\{.*"openapi".*?\})', text, re.DOTALL)
        if json_match:
            try:
                spec = json.loads(json_match.group(1))
                if 'openapi' in spec or 'swagger' in spec:
                    return spec
            except json.JSONDecodeError:
                pass

        return None


class KingOfBrowser:
    """
    Master agent for technical reconnaissance.
    Converts raw technical assets into a verified Technical Topology Map.
    """

    def __init__(self, github_token: Optional[str] = None):
        self.github_scraper = GitHubScraper(token=github_token)
        self.dns_resolver = DNSResolver()
        self.url_scraper = URLScraper()
        self.api_discoverer = APIDiscoverer()

    async def analyze(self, target: str, target_type: str = "auto") -> TechnicalTopologyMap:
        """
        Analyze a technical target and return its topology map.

        Args:
            target: URL, domain, or GitHub repo (owner/repo)
            target_type: 'github', 'domain', 'url', or 'auto' (detect)

        Returns:
            TechnicalTopologyMap with extracted data
        """
        import time
        start = time.time()

        # Auto-detect type if not specified
        if target_type == "auto":
            if '/' in target and 'github.com' not in target:
                target_type = 'github'  # Assume owner/repo format
            elif 'github.com' in target:
                target_type = 'github'
            elif target.startswith('http'):
                target_type = 'url'
            else:
                target_type = 'domain'

        code_files = []
        dns_records = []
        api_endpoints = []
        documentation_snippets = []
        errors = []

        try:
            if target_type == 'github':
                if 'github.com' in target:
                    # Extract owner/repo from URL
                    parts = target.split('github.com/')
                    if len(parts) > 1:
                        owner_repo = parts[1].strip('/')
                        owner, repo = owner_repo.split('/')[:2]
                    else:
                        raise ValueError("Invalid GitHub URL")
                else:
                    # Assume format owner/repo
                    owner, repo = target.split('/')[:2]

                code_files = await self.github_scraper.scrape_repo(owner, repo)
                # Also scrape GitHub pages for documentation
                github_io_url = f"https://{repo}.github.io"
                try:
                    doc_data = await self.url_scraper.scrape(github_io_url)
                    snippets = doc_data.get('documentation_snippets') or [] if doc_data else []
                    if snippets:
                        documentation_snippets.extend(snippets)
                except Exception:
                    # Silently ignore failures to scrape GitHub pages
                    pass

            elif target_type == 'domain':
                dns_records = await self.dns_resolver.resolve(target)
                # Try to scrape main website too
                try:
                    doc_data = await self.url_scraper.scrape(f"https://{target}")
                    snippets = doc_data.get('documentation_snippets') or [] if doc_data else []
                    if snippets:
                        documentation_snippets.extend(snippets)
                except Exception:
                    pass

            elif target_type == 'url':
                doc_data = await self.url_scraper.scrape(target)
                snippets = doc_data.get('documentation_snippets') or [] if doc_data else []
                if snippets:
                    documentation_snippets.extend(snippets)
                # If URL points to an OpenAPI spec, parse it
                if target.endswith('.json') or target.endswith('.yaml'):
                    text_content = doc_data.get('text_content', '') if doc_data else ''
                    spec = self.api_discoverer.extract_openapi_from_text(text_content)
                    if spec:
                        api_endpoints = self._parse_openapi(spec)

        except Exception as e:
            errors.append(f"{target_type} analysis failed: {str(e)}")

        processing_time = (time.time() - start) * 1000

        return TechnicalTopologyMap(
            source_url=target,
            source_type=target_type,
            timestamp=datetime.utcnow().isoformat(),
            code_files=code_files,
            dns_records=dns_records,
            api_endpoints=api_endpoints,
            documentation_snippets=documentation_snippets,
            raw_content_length=sum(len(cf.content) for cf in code_files),
            processing_time_ms=processing_time,
            errors=errors if errors else None
        )

    def _parse_openapi(self, spec: Dict[str, Any]) -> List[APIEndpoint]:
        """Extract endpoints from OpenAPI specification."""
        endpoints = []
        paths = spec.get('paths', {})

        for path, methods in paths.items():
            for method, details in methods.items():
                endpoint = APIEndpoint(
                    url=path,
                    method=method.upper(),
                    description=details.get('summary') or details.get('description'),
                    parameters=details.get('parameters'),
                    response_schema=details.get('responses')
                )
                endpoints.append(endpoint)

        return endpoints


# Convenience function
async def analyze_target(target: str, github_token: Optional[str] = None) -> TechnicalTopologyMap:
    """Quick analysis function."""
    king = KingOfBrowser(github_token=github_token)
    return await king.analyze(target)
