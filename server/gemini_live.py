# Copyright 2026 Google LLC
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

import google.genai as genai
from google.genai import types
import asyncio
import base64
import json
import logging
import inspect
from typing import Optional, List, Dict, Callable, AsyncGenerator

from server.ai_provider import AILiveProvider

logger = logging.getLogger(__name__)


class GeminiLive(AILiveProvider):
    """
    Google Gemini Live API provider for real-time speech-to-speech conversations.

    Data is processed via Google Cloud (US/EU), covered by Google's Data Processing
    Addendum and the EU-US Data Privacy Framework.
    """

    @property
    def provider_name(self) -> str:
        return "Google Gemini"

    @property
    def data_jurisdiction(self) -> str:
        return "US/EU"
    def __init__(self, project_id: str, location: str, model: str, input_sample_rate: int = 16000):
        self.project_id = project_id
        self.location = location
        self.model = model
        self.input_sample_rate = input_sample_rate
        logger.info("GeminiLive initialized with: project=%s, location=%s, model=%s, sample_rate=%d",
                    project_id, location, model, input_sample_rate)
        
        # Initialize client
        self.client = genai.Client(vertexai=True, project=project_id, location=location)
        self.tool_mapping = {}

    def register_tool(self, func: Callable):
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
        Connects to Gemini Live and proxies data between queues/callbacks and the session.
        """

        logger.debug("Setup config received: %s", json.dumps(setup_config, indent=2) if setup_config else "None")

        config_args = {
            "response_modalities": [types.Modality.AUDIO]
        }
        
        if setup_config:
            # Parse configuration from frontend
            if "generation_config" in setup_config:
                gen_config = setup_config["generation_config"]
                if "response_modalities" in gen_config:
                    config_args["response_modalities"] = [
                        types.Modality(m) for m in gen_config["response_modalities"]
                    ]
                if "speech_config" in gen_config:
                   try:
                       voice_name = gen_config["speech_config"]["voice_config"]["prebuilt_voice_config"]["voice_name"]
                       config_args["speech_config"] = types.SpeechConfig(
                           voice_config=types.VoiceConfig(
                               prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice_name)
                           )
                       )
                   except (KeyError, TypeError):
                       pass

            if "system_instruction" in setup_config:
                try:
                    text = setup_config["system_instruction"]["parts"][0]["text"]
                    config_args["system_instruction"] = types.Content(parts=[types.Part(text=text)])
                except (KeyError, IndexError, TypeError):
                    pass
            
            if "proactivity" in setup_config:
                try:
                    proactive_audio = setup_config["proactivity"].get("proactiveAudio", False)
                    config_args["proactivity"] = types.ProactivityConfig(proactive_audio=proactive_audio)
                except (AttributeError, TypeError):
                    pass

            if "tools" in setup_config:
                try:
                    tool_config = setup_config["tools"]
                    if "function_declarations" in tool_config:
                        fds = []
                        for fd in tool_config["function_declarations"]:
                            fds.append(types.FunctionDeclaration(
                                name=fd.get("name"),
                                description=fd.get("description"),
                                parameters=fd.get("parameters")
                            ))
                        config_args["tools"] = [types.Tool(function_declarations=fds)]
                except Exception as e:
                    logger.warning(f"Error parsing tools config: {e}")

        # Config output transcription
        if setup_config and "output_audio_transcription" in setup_config:
            logger.debug("Output audio transcription enabled")
            config_args["output_audio_transcription"] = types.AudioTranscriptionConfig()
        if setup_config and "input_audio_transcription" in setup_config:
            logger.debug("Input audio transcription enabled")
            config_args["input_audio_transcription"] = types.AudioTranscriptionConfig()

        # Context window compression - DISABLED for now
        # Testing showed native audio models may stop more frequently with compression enabled
        # See: https://github.com/google-gemini/live-api-web-console/issues/117
        # Uncomment to re-enable:
        # config_args["context_window_compression"] = types.ContextWindowCompressionConfig(
        #     trigger_tokens=25000,
        #     sliding_window=types.SlidingWindow(target_tokens=15000)
        # )
        # logger.info("Context window compression enabled: trigger=25000, target=15000 tokens")

        # Session resumption - ALWAYS enable for automatic reconnection with preserved context
        # Tokens remain valid for 2 hours after session ends
        resumption_config = types.SessionResumptionConfig()
        if setup_config and "session_resumption" in setup_config:
            session_resumption = setup_config["session_resumption"]
            if session_resumption.get("handle"):
                resumption_config.handle = session_resumption["handle"]
            if session_resumption.get("token"):
                resumption_config.token = session_resumption["token"]
                logger.info("Session resumption: reconnecting with existing token")
        config_args["session_resumption"] = resumption_config
        logger.info("Session resumption enabled")

        config = types.LiveConnectConfig(**config_args)
        
        # Connect using the new async client interface
        async with self.client.aio.live.connect(model=self.model, config=config) as session:
            
            async def send_audio():
                try:
                    while True:
                        chunk = await audio_input_queue.get()
                        await session.send_realtime_input(
                            audio=types.Blob(data=chunk, mime_type=f"audio/pcm;rate={self.input_sample_rate}")
                        )
                except asyncio.CancelledError:
                    pass

            async def keepalive():
                """Send silent audio every 30 seconds to prevent premature idle timeout"""
                # 16000 Hz * 16-bit = 32000 bytes/sec, 0.1 sec = 3200 bytes of silence
                silence = bytes(3200)
                try:
                    while True:
                        await asyncio.sleep(30)
                        await session.send_realtime_input(
                            audio=types.Blob(data=silence, mime_type=f"audio/pcm;rate={self.input_sample_rate}")
                        )
                except asyncio.CancelledError:
                    pass

            async def send_video():
                # Not heavily used in Immergo yet, but good to have
                try:
                    while True:
                        chunk = await video_input_queue.get()
                        await session.send_realtime_input(
                            video=types.Blob(data=chunk, mime_type="image/jpeg")
                        )
                except asyncio.CancelledError:
                    pass

            async def send_text():
                try:
                    while True:
                        text = await text_input_queue.get()
                        await session.send(input=text, end_of_turn=True)
                except asyncio.CancelledError:
                    pass

            event_queue = asyncio.Queue()

            async def receive_loop():
                message_count = 0
                MESSAGE_LIMIT_WARNING = 900  # Warn client when approaching 1000 limit
                limit_warning_sent = False
                try:
                    logger.info("Starting receive loop...")
                    while True:
                        async for response in session.receive():
                            message_count += 1
                            if message_count % 50 == 0:
                                logger.debug(f"Received {message_count} messages from Gemini")

                            # Warn client when approaching 1000 message limit
                            if message_count >= MESSAGE_LIMIT_WARNING and not limit_warning_sent:
                                limit_warning_sent = True
                                logger.warning(f"Approaching message limit: {message_count}/1000")
                                await event_queue.put({
                                    "messageLimitWarning": {
                                        "count": message_count,
                                        "limit": 1000,
                                        "message": "Approaching session message limit"
                                    }
                                })
                            server_content = response.server_content
                            tool_call = response.tool_call
                            
                            if server_content:

                                # uncomment for token usage
                                # if response.usage_metadata:
                                #     print("💰 Usage metadata:", response.usage_metadata)

                                if server_content.model_turn:
                                    for part in server_content.model_turn.parts:
                                        if part.inline_data:
                                            # Audio data being returned
                                            if inspect.iscoroutinefunction(audio_output_callback):
                                                await audio_output_callback(part.inline_data.data)
                                            else:
                                                audio_output_callback(part.inline_data.data)
                                
                                if server_content.input_transcription:
                                    # User speech transcription
                                    await event_queue.put({
                                        "serverContent": {
                                            "inputTranscription": {
                                                "text": server_content.input_transcription.text,
                                                "finished": True 
                                            }
                                        }
                                    })
                                
                                if server_content.output_transcription:
                                    # Model output transcription
                                    logger.debug("Output transcription: %s", server_content.output_transcription.text)
                                    await event_queue.put({
                                        "serverContent": {
                                            "outputTranscription": {
                                                "text": server_content.output_transcription.text,
                                                "finished": True
                                            }
                                        }
                                    })
                                
                                if server_content.turn_complete:
                                    await event_queue.put({"serverContent": {"turnComplete": True}})
                                
                                if server_content.interrupted:
                                    await event_queue.put({"serverContent": {"interrupted": True}})
                                    # Stop playback on client is handled by event, but we can callback too
                                    if audio_interrupt_callback:
                                        if inspect.iscoroutinefunction(audio_interrupt_callback):
                                            await audio_interrupt_callback()
                                        else:
                                            audio_interrupt_callback()
                                    await event_queue.put({"type": "interrupted"})

                            # Session resumption updates - forward to client for auto-reconnect
                            # Check both possible attribute names
                            session_update = getattr(response, 'session_resumption_update', None) or getattr(response, 'sessionResumptionUpdate', None)
                            if session_update:
                                session_id = getattr(session_update, 'session_id', None) or getattr(session_update, 'sessionId', None)
                                token = getattr(session_update, 'token', None)
                                logger.info(f"Session resumption update received - session_id: {session_id[:20] if session_id else 'None'}..., has_token: {bool(token)}")
                                await event_queue.put({
                                    "sessionResumptionUpdate": {
                                        "sessionId": session_id,
                                        "token": token,
                                        "resumable": getattr(session_update, 'resumable', True)
                                    }
                                })

                            # GoAway - server is terminating connection soon
                            if hasattr(response, 'go_away') and response.go_away:
                                go_away = response.go_away
                                time_left = getattr(go_away, 'time_left', None)
                                await event_queue.put({
                                    "goAway": {
                                        "timeLeft": str(time_left) if time_left else None
                                    }
                                })
                                logger.info(f"GoAway received, connection ending in: {time_left}")

                            if tool_call:
                                function_responses = []
                                client_tool_calls = []

                                for fc in tool_call.function_calls:
                                    func_name = fc.name
                                    args = fc.args or {}
                                    
                                    if func_name in self.tool_mapping:
                                        try:
                                            tool_func = self.tool_mapping[func_name]
                                            if inspect.iscoroutinefunction(tool_func):
                                                result = await tool_func(**args)
                                            else:
                                                loop = asyncio.get_running_loop()
                                                result = await loop.run_in_executor(None, lambda: tool_func(**args))
                                        except Exception as e:
                                            result = f"Error: {e}"
                                        
                                        function_responses.append(types.FunctionResponse(
                                            name=func_name,
                                            id=fc.id,
                                            response={"result": result}
                                        ))
                                        await event_queue.put({"type": "tool_call", "name": func_name, "args": args, "result": result})
                                    else:
                                        # Unknown tool, assume client-side
                                        client_tool_calls.append({
                                            "name": fc.name,
                                            "args": args,
                                            "id": fc.id
                                        })
                                
                                if client_tool_calls:
                                    # Forward to client
                                    await event_queue.put({
                                        "toolCall": {
                                            "functionCalls": client_tool_calls
                                        }
                                    })

                                if function_responses:
                                    await session.send_tool_response(function_responses=function_responses)

                except Exception as e:
                    logger.error(f"Receive loop error after {message_count} messages: {type(e).__name__}: {e}")
                    await event_queue.put({"type": "error", "error": str(e)})
                finally:
                    logger.info(f"Receive loop ended after {message_count} total messages")
                    await event_queue.put(None)

            send_audio_task = asyncio.create_task(send_audio())
            send_video_task = asyncio.create_task(send_video())
            send_text_task = asyncio.create_task(send_text())
            receive_task = asyncio.create_task(receive_loop())
            keepalive_task = asyncio.create_task(keepalive())

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
                keepalive_task.cancel()
