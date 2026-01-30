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
Alibaba Qwen3-Omni-Realtime provider for real-time speech-to-speech conversations.

This provider connects to Alibaba Cloud's DashScope API for full-duplex
audio conversations. Data is processed in China.

GDPR Note: This provider requires explicit user consent for EU users as
data is transferred to China where GDPR protections do not apply.
"""

import asyncio
import base64
import json
import logging
import uuid
from typing import Optional, Dict, Callable, AsyncGenerator

import websockets

from server.ai_provider import AILiveProvider

logger = logging.getLogger(__name__)

# DashScope WebSocket endpoints
DASHSCOPE_WS_ENDPOINT_INTL = "wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime"
DASHSCOPE_WS_ENDPOINT_CN = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"


class QwenOmniLive(AILiveProvider):
    """
    Alibaba Qwen3-Omni-Realtime provider for speech-to-speech conversations.

    IMPORTANT: Data is processed in China. GDPR consent required for EU users.
    """

    @property
    def provider_name(self) -> str:
        return "Alibaba Qwen"

    @property
    def data_jurisdiction(self) -> str:
        return "China"

    def __init__(
        self,
        api_key: str,
        model: str = "qwen3-omni-flash-realtime",
        region: str = "intl",
        input_sample_rate: int = 16000
    ):
        """
        Initialize the Qwen Omni Live provider.

        Args:
            api_key: DashScope API key (from Alibaba Cloud)
            model: Model identifier (default: qwen3-omni-flash-realtime)
            region: "intl" for Singapore or "cn" for Beijing
            input_sample_rate: Audio sample rate (16000 Hz)
        """
        self.api_key = api_key
        self.model = model
        self.region = region
        self.input_sample_rate = input_sample_rate
        self.tool_mapping: Dict[str, Callable] = {}

        # Select endpoint based on region
        self.endpoint = (
            DASHSCOPE_WS_ENDPOINT_INTL if region == "intl"
            else DASHSCOPE_WS_ENDPOINT_CN
        )

        logger.info(
            "QwenOmniLive initialized: model=%s, region=%s, endpoint=%s",
            model, region, self.endpoint
        )

    def register_tool(self, func: Callable) -> Callable:
        """Register a tool for function calling."""
        self.tool_mapping[func.__name__] = func
        return func

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
        Start a real-time conversation session with Qwen Omni.

        Connects to DashScope WebSocket API and proxies audio/events.
        """
        ws_url = f"{self.endpoint}?model={self.model}"

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "OpenAI-Beta": "realtime=v1"
        }

        logger.info("Connecting to Qwen Omni: %s", ws_url)

        async with websockets.connect(
            ws_url,
            additional_headers=headers,
            ping_interval=30,
            ping_timeout=10
        ) as websocket:

            # Send session configuration
            session_config = self._build_session_config(setup_config)
            await websocket.send(json.dumps(session_config))
            logger.debug("Sent session config: %s", json.dumps(session_config, indent=2))

            event_queue: asyncio.Queue = asyncio.Queue()

            async def send_audio():
                """Send audio chunks from input queue to Qwen."""
                try:
                    while True:
                        chunk = await audio_input_queue.get()
                        # Encode audio as base64
                        audio_b64 = base64.b64encode(chunk).decode("utf-8")
                        message = {
                            "event_id": f"audio_{uuid.uuid4().hex[:8]}",
                            "type": "input_audio_buffer.append",
                            "audio": audio_b64
                        }
                        await websocket.send(json.dumps(message))
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    logger.error("Error sending audio: %s", e)

            async def send_video():
                """Send video frames from input queue to Qwen."""
                try:
                    while True:
                        frame = await video_input_queue.get()
                        # Encode frame as base64
                        frame_b64 = base64.b64encode(frame).decode("utf-8")
                        message = {
                            "event_id": f"video_{uuid.uuid4().hex[:8]}",
                            "type": "input_image_buffer.append",
                            "image": frame_b64
                        }
                        await websocket.send(json.dumps(message))
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    logger.error("Error sending video: %s", e)

            async def send_text():
                """Send text messages from input queue to Qwen."""
                try:
                    while True:
                        text = await text_input_queue.get()
                        message = {
                            "event_id": f"text_{uuid.uuid4().hex[:8]}",
                            "type": "conversation.item.create",
                            "item": {
                                "type": "message",
                                "role": "user",
                                "content": [{"type": "input_text", "text": text}]
                            }
                        }
                        await websocket.send(json.dumps(message))
                        # Request response after text
                        await websocket.send(json.dumps({
                            "event_id": f"resp_{uuid.uuid4().hex[:8]}",
                            "type": "response.create"
                        }))
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    logger.error("Error sending text: %s", e)

            async def receive_loop():
                """Receive and process messages from Qwen."""
                message_count = 0
                try:
                    async for raw_message in websocket:
                        message_count += 1
                        if message_count % 50 == 0:
                            logger.debug("Received %d messages from Qwen", message_count)

                        try:
                            event = json.loads(raw_message)
                            event_type = event.get("type", "")

                            # Handle audio output
                            if event_type == "response.audio.delta":
                                audio_b64 = event.get("delta", "")
                                if audio_b64:
                                    audio_bytes = base64.b64decode(audio_b64)
                                    if asyncio.iscoroutinefunction(audio_output_callback):
                                        await audio_output_callback(audio_bytes)
                                    else:
                                        audio_output_callback(audio_bytes)

                            # Handle transcriptions
                            elif event_type == "conversation.item.input_audio_transcription.completed":
                                transcript = event.get("transcript", "")
                                await event_queue.put({
                                    "serverContent": {
                                        "inputTranscription": {
                                            "text": transcript,
                                            "finished": True
                                        }
                                    }
                                })

                            elif event_type == "response.audio_transcript.delta":
                                transcript = event.get("delta", "")
                                await event_queue.put({
                                    "serverContent": {
                                        "outputTranscription": {
                                            "text": transcript,
                                            "finished": False
                                        }
                                    }
                                })

                            elif event_type == "response.audio_transcript.done":
                                transcript = event.get("transcript", "")
                                await event_queue.put({
                                    "serverContent": {
                                        "outputTranscription": {
                                            "text": transcript,
                                            "finished": True
                                        }
                                    }
                                })

                            # Handle turn completion
                            elif event_type == "response.done":
                                await event_queue.put({
                                    "serverContent": {"turnComplete": True}
                                })

                            # Handle interruption
                            elif event_type == "input_audio_buffer.speech_started":
                                if audio_interrupt_callback:
                                    if asyncio.iscoroutinefunction(audio_interrupt_callback):
                                        await audio_interrupt_callback()
                                    else:
                                        audio_interrupt_callback()
                                await event_queue.put({
                                    "serverContent": {"interrupted": True}
                                })

                            # Handle session events
                            elif event_type == "session.created":
                                logger.info("Qwen session created")

                            elif event_type == "session.updated":
                                logger.info("Qwen session updated")

                            # Handle errors
                            elif event_type == "error":
                                error_msg = event.get("error", {}).get("message", "Unknown error")
                                logger.error("Qwen error: %s", error_msg)
                                await event_queue.put({
                                    "type": "error",
                                    "error": error_msg
                                })

                        except json.JSONDecodeError:
                            logger.warning("Invalid JSON from Qwen: %s", raw_message[:100])

                except websockets.ConnectionClosed as e:
                    logger.info("Qwen connection closed: %s", e)
                except Exception as e:
                    logger.error("Receive loop error after %d messages: %s", message_count, e)
                    await event_queue.put({"type": "error", "error": str(e)})
                finally:
                    logger.info("Receive loop ended after %d total messages", message_count)
                    await event_queue.put(None)

            # Start all tasks
            send_audio_task = asyncio.create_task(send_audio())
            send_video_task = asyncio.create_task(send_video())
            send_text_task = asyncio.create_task(send_text())
            receive_task = asyncio.create_task(receive_loop())

            try:
                while True:
                    event = await event_queue.get()
                    if event is None:
                        break
                    yield event
            finally:
                send_audio_task.cancel()
                send_video_task.cancel()
                send_text_task.cancel()
                receive_task.cancel()

    def _build_session_config(self, setup_config: Optional[Dict]) -> Dict:
        """
        Build Qwen session configuration from frontend config.

        Translates our generic config format to DashScope format.
        """
        config = {
            "event_id": f"session_{uuid.uuid4().hex[:8]}",
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "input_audio_format": "pcm16",
                "output_audio_format": "pcm24",
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.5,
                    "silence_duration_ms": 500,
                    "prefix_padding_ms": 300
                },
                "input_audio_transcription": {
                    "model": "qwen3-asr-realtime"
                }
            }
        }

        if not setup_config:
            return config

        session = config["session"]

        # Map voice name
        if "generation_config" in setup_config:
            gen_config = setup_config["generation_config"]
            try:
                voice_name = gen_config["speech_config"]["voice_config"]["prebuilt_voice_config"]["voice_name"]
                # Map Gemini voices to Qwen voices (approximate)
                voice_mapping = {
                    "Puck": "Cherry",
                    "Charon": "Serena",
                    "Kore": "Ethan",
                    "Fenrir": "Chelsie",
                    "Aoede": "Aria"
                }
                session["voice"] = voice_mapping.get(voice_name, "Cherry")
            except (KeyError, TypeError):
                session["voice"] = "Cherry"

        # Map system instructions
        if "system_instruction" in setup_config:
            try:
                text = setup_config["system_instruction"]["parts"][0]["text"]
                session["instructions"] = text
            except (KeyError, IndexError, TypeError):
                pass

        # Map turn detection settings
        if "realtime_input_config" in setup_config:
            try:
                aad = setup_config["realtime_input_config"].get("automatic_activity_detection", {})
                if aad.get("disabled"):
                    session["turn_detection"] = None
                else:
                    td = session["turn_detection"]
                    if "silence_duration_ms" in aad:
                        td["silence_duration_ms"] = aad["silence_duration_ms"]
                    if "prefix_padding_ms" in aad:
                        td["prefix_padding_ms"] = aad["prefix_padding_ms"]
            except (KeyError, TypeError):
                pass

        return config
