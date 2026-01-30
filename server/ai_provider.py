# Copyright 2026 SmarterGerman
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""
Abstract base class for real-time AI conversation providers.

This module defines the interface that all AI providers must implement
to be used with the conversation tool. Currently supported providers:
- Google Gemini Live (default)
- Alibaba Qwen3-Omni (alternative, requires explicit GDPR consent for EU users)
"""

from abc import ABC, abstractmethod
from typing import Optional, Dict, Callable, AsyncGenerator
import asyncio


class AILiveProvider(ABC):
    """
    Abstract base class for real-time AI conversation providers.

    All providers must implement this interface to ensure consistent
    behavior across the application.
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """
        Return the human-readable provider name.

        Used for logging and user-facing disclosure.
        Example: "Google Gemini", "Alibaba Qwen"
        """
        pass

    @property
    @abstractmethod
    def data_jurisdiction(self) -> str:
        """
        Return the data processing jurisdiction.

        Used for GDPR compliance disclosure.
        Example: "US/EU", "China"
        """
        pass

    @property
    def requires_gdpr_consent(self) -> bool:
        """
        Whether this provider requires explicit GDPR consent for EU users.

        Returns True for providers processing data outside EU/US Data Privacy Framework.
        """
        return self.data_jurisdiction not in ("EU", "US/EU", "US")

    @abstractmethod
    async def start_session(
        self,
        audio_input_queue: asyncio.Queue,
        video_input_queue: asyncio.Queue,
        text_input_queue: asyncio.Queue,
        audio_output_callback: Callable,
        audio_interrupt_callback: Optional[Callable] = None,
        setup_config: Optional[Dict] = None
    ) -> AsyncGenerator[Dict, None]:
        """
        Start a real-time conversation session.

        This method connects to the AI provider and proxies data between
        the input queues/callbacks and the provider's session.

        Args:
            audio_input_queue: Queue receiving PCM audio chunks from microphone
            video_input_queue: Queue receiving JPEG frames from camera
            text_input_queue: Queue receiving text messages
            audio_output_callback: Called with audio bytes when model responds
            audio_interrupt_callback: Called when model speech is interrupted
            setup_config: Provider-specific configuration (voice, system prompt, etc.)

        Yields:
            Event dictionaries with transcriptions, turn completions, tool calls, etc.
        """
        pass

    def register_tool(self, func: Callable) -> Callable:
        """
        Register a tool/function for the AI to call.

        Override this method to enable function calling with the provider.

        Args:
            func: The function to register as a tool

        Returns:
            The function (for use as a decorator)
        """
        return func


def get_provider_info(provider: AILiveProvider) -> Dict:
    """
    Get provider information for API responses and disclosures.

    Args:
        provider: The AI provider instance

    Returns:
        Dictionary with provider metadata
    """
    return {
        "name": provider.provider_name,
        "jurisdiction": provider.data_jurisdiction,
        "requires_consent": provider.requires_gdpr_consent
    }
