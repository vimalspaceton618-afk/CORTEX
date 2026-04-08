"""Teacher model client abstraction."""

import os
import asyncio
from typing import Dict, Any, Optional
from dataclasses import dataclass, asdict
from datetime import datetime

import openai
import anthropic
from google import genai


@dataclass
class TeacherResponse:
    """Standardized response from any teacher model."""
    teacher_name: str
    content: str
    tokens_used: int
    timestamp: str
    metadata: Dict[str, Any]


class TeacherClient:
    """Abstract base class for teacher model clients."""

    def __init__(self, config):
        self.config = config

    async def query(self, prompt: str) -> TeacherResponse:
        """Send prompt to teacher model. Override in subclasses."""
        raise NotImplementedError


class AnthropicTeacher(TeacherClient):
    """Anthropic Claude teacher."""

    def __init__(self, config):
        super().__init__(config)
        self.client = anthropic.Anthropic(api_key=config.api_key)

    async def query(self, prompt: str) -> TeacherResponse:
        """Query Claude model."""
        message = self.client.messages.create(
            model=self.config.model_id,
            max_tokens=self.config.max_tokens,
            temperature=self.config.temperature,
            messages=[{"role": "user", "content": prompt}]
        )
        return TeacherResponse(
            teacher_name=self.config.name,
            content=message.content[0].text,
            tokens_used=message.usage.input_tokens + message.usage.output_tokens,
            timestamp=datetime.utcnow().isoformat(),
            metadata={'provider': 'anthropic', 'model': self.config.model_id}
        )


class OpenAITeacher(TeacherClient):
    """OpenAI-compatible teacher (covers Groq, Together, OpenAI itself)."""

    def __init__(self, config):
        super().__init__(config)
        self.client = openai.AsyncOpenAI(
            api_key=config.api_key,
            base_url=config.base_url
        )

    async def query(self, prompt: str) -> TeacherResponse:
        """Query OpenAI-compatible model."""
        response = await self.client.chat.completions.create(
            model=self.config.model_id,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=self.config.max_tokens,
            temperature=self.config.temperature
        )
        return TeacherResponse(
            teacher_name=self.config.name,
            content=response.choices[0].message.content,
            tokens_used=response.usage.total_tokens,
            timestamp=datetime.utcnow().isoformat(),
            metadata={
                'provider': self.config.provider,
                'model': self.config.model_id,
                'finish_reason': response.choices[0].finish_reason
            }
        )


class GoogleTeacher(TeacherClient):
    """Google Gemini teacher."""

    def __init__(self, config):
        super().__init__(config)
        self.client = genai.Client(api_key=config.api_key)

    async def query(self, prompt: str) -> TeacherResponse:
        """Query Gemini model."""
        response = self.client.models.generate_content(
            model=self.config.model_id,
            contents=prompt
        )
        # Get token usage if available
        tokens_used = getattr(response, 'usage', {}).get('total_tokens', 0)

        return TeacherResponse(
            teacher_name=self.config.name,
            content=response.text,
            tokens_used=tokens_used,
            timestamp=datetime.utcnow().isoformat(),
            metadata={'provider': 'google', 'model': self.config.model_id}
        )


# Factory to create teacher clients
TEACHER_CLASSES = {
    'anthropic': AnthropicTeacher,
    'openai': OpenAITeacher,
    'google': GoogleTeacher,
    'groq': OpenAITeacher,  # Groq uses OpenAI-compatible API
    'together': OpenAITeacher  # Together uses OpenAI-compatible API
}


def create_teacher(config):
    """Factory function to create teacher client from config."""
    teacher_class = TEACHER_CLASSES.get(config.provider)
    if not teacher_class:
        raise ValueError(f"Unknown provider: {config.provider}")
    return teacher_class(config)
