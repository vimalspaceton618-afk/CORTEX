"""CORTEX Agent AI OS configuration management."""

import os
from dataclasses import dataclass, field
from typing import List, Optional
import yaml
from dotenv import load_dotenv


@dataclass
class TeacherConfig:
    """Configuration for a teacher model."""
    name: str
    provider: str  # 'anthropic', 'openai', 'google', 'groq', 'together', etc.
    model_id: str  # Model identifier (e.g., 'claude-opus-4-6-20250514')
    base_url: Optional[str] = None  # For OpenAI-compatible APIs
    max_tokens: int = 4096
    temperature: float = 0.7
    enabled: bool = True
    api_key_env: Optional[str] = None  # Environment variable name (deprecated, use api_key)
    api_key: Optional[str] = None  # Direct API key (preferred)


@dataclass
class KingConfig:
    """Configuration for King of Browser."""
    github_token_env: Optional[str] = None
    user_agent: str = "CORTEX-King/1.0"
    request_timeout: int = 30


@dataclass
class KnowledgeConfig:
    """Configuration for knowledge storage."""
    storage_path: str = "Z:/cortex_data"  # 5TB Google Drive mounted
    embedding_model: str = "all-MiniLM-L6-v2"
    use_faiss: bool = True
    similarity_threshold: float = 0.85


@dataclass
class AgentConfig:
    """Configuration for multi-agent system."""
    enabled_agents: List[str] = field(default_factory=lambda: ["researcher", "coder", "verifier", "architect"])
    max_agents_per_task: int = 3
    debate_rounds: int = 2


@dataclass
class ReasoningConfig:
    """Configuration for cognitive reasoning."""
    max_reasoning_steps: int = 10
    max_reflection_cycles: int = 3
    reasoning_mode: str = "chain"  # "chain" | "tree" | "graph"
    use_teacher_for_reasoning: bool = True


@dataclass
class ToolConfig:
    """Configuration for tool/action system."""
    enabled_tools: List[str] = field(default_factory=lambda: ["python_repl", "filesystem", "web_search"])
    code_timeout: int = 30
    allowed_paths: List[str] = field(default_factory=list)
    blocked_modules: List[str] = field(default_factory=lambda: [
        "os", "sys", "subprocess", "ctypes", "socket", "requests",
        "urllib", "http", "ftplib", "smtplib", "telnetlib"
    ])


@dataclass
class MemoryConfig:
    """Configuration for memory system."""
    episodic_max: int = 1000
    consolidation_threshold: int = 5
    working_context_tokens: int = 8000
    decay_half_life_days: int = 30


@dataclass
class PlanningConfig:
    """Configuration for planning system."""
    max_plan_depth: int = 5
    enable_rollback: bool = True
    max_retries: int = 3


@dataclass
class CortexConfig:
    """Main CORTEX Agent AI OS configuration."""
    teachers: List[TeacherConfig]
    king: KingConfig
    knowledge: KnowledgeConfig
    agents: AgentConfig = field(default_factory=AgentConfig)
    reasoning: ReasoningConfig = field(default_factory=ReasoningConfig)
    tools: ToolConfig = field(default_factory=ToolConfig)
    memory: MemoryConfig = field(default_factory=MemoryConfig)
    planning: PlanningConfig = field(default_factory=PlanningConfig)

    @classmethod
    def from_yaml(cls, path: str) -> 'CortexConfig':
        """Load configuration from YAML file."""
        with open(path, 'r') as f:
            data = yaml.safe_load(f)

        teachers_data = []
        for t in data.get('teachers', []):
            # If api_key not set but api_key_env is, try to resolve from env
            if 'api_key' not in t and 'api_key_env' in t:
                env_key = os.getenv(t['api_key_env'])
                if env_key:
                    t['api_key'] = env_key
                else:
                    print(f"[WARN] No API key found for {t['name']} (env: {t['api_key_env']}) - teacher disabled")
                    t['enabled'] = False
            teachers_data.append(TeacherConfig(**t))

        king = KingConfig(**data.get('king', {}))
        knowledge = KnowledgeConfig(**data.get('knowledge', {}))

        # New subsystem configs (optional -- have defaults)
        agents = AgentConfig(**data.get('agents', {}))
        reasoning = ReasoningConfig(**data.get('reasoning', {}))
        tools = ToolConfig(**data.get('tools', {}))
        memory = MemoryConfig(**data.get('memory', {}))
        planning = PlanningConfig(**data.get('planning', {}))

        return cls(teachers=teachers_data, king=king, knowledge=knowledge,
                   agents=agents, reasoning=reasoning, tools=tools,
                   memory=memory, planning=planning)

    @classmethod
    def from_env(cls) -> 'CortexConfig':
        """Load configuration from environment variables."""
        teachers_data = []

        # Common teacher configurations
        teacher_configs = [
            {
                'name': 'ClaudeOpus',
                'provider': 'anthropic',
                'api_key_env': 'ANTHROPIC_API_KEY',
                'model_id': 'claude-opus-4-6-20250514'
            },
            {
                'name': 'GeminiPro',
                'provider': 'google',
                'api_key_env': 'GOOGLE_API_KEY',
                'model_id': 'gemini-1.5-pro'  # Update as needed
            },
            {
                'name': 'GPT4',
                'provider': 'openai',
                'api_key_env': 'OPENAI_API_KEY',
                'model_id': 'gpt-4-turbo-preview'
            },
            {
                'name': 'GroqLlama',
                'provider': 'groq',
                'api_key_env': 'GROQ_API_KEY',
                'model_id': 'llama3-70b-8192',
                'base_url': 'https://api.groq.com/openai/v1'
            },
            {
                'name': 'Llama4',
                'provider': 'together',
                'api_key_env': 'TOGETHER_API_KEY',
                'model_id': 'meta-llama/Llama-3-70b-chat-hf',
                'base_url': 'https://api.together.xyz/v1'
            }
        ]

        for t in teacher_configs:
            api_key = os.getenv(t['api_key_env'])
            if api_key:  # Only add if API key exists
                # Set the actual api_key field and optionally keep api_key_env for reference
                t['api_key'] = api_key
                # We can keep api_key_env but it's not needed after resolution
                teachers_data.append(TeacherConfig(**t))
            else:
                print(f"[WARN] No API key found for {t['name']} (env: {t['api_key_env']})")

        return cls(
            teachers=teachers_data,
            king=KingConfig(
                github_token_env=os.getenv('GITHUB_TOKEN'),
                user_agent=os.getenv('CORTEX_USER_AGENT', 'CORTEX-King/1.0')
            ),
            knowledge=KnowledgeConfig(
                storage_path=os.getenv('CORTEX_STORAGE_PATH', 'Z:/cortex_data'),
                embedding_model=os.getenv('CORTEX_EMBEDDING_MODEL', 'all-MiniLM-L6-v2'),
                use_faiss=os.getenv('CORTEX_USE_FAISS', 'true').lower() == 'true',
                similarity_threshold=float(os.getenv('CORTEX_SIMILARITY_THRESHOLD', '0.85'))
            )
        )


def load_config(config_path: Optional[str] = None) -> CortexConfig:
    """
    Load configuration from file or environment.

    Priority:
        1. config_path if provided
        2. config.yaml in current directory
        3. Environment variables only
    """
    # Load .env file if present, override existing env vars
    load_dotenv(override=True)

    if config_path is None:
        config_path = 'config.yaml'

    if os.path.exists(config_path):
        print(f"[INFO] Loading config from {config_path}")
        return CortexConfig.from_yaml(config_path)
    else:
        print(f"[INFO] config.yaml not found, loading from environment")
        return CortexConfig.from_env()
