/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Gemini Live API Utilities
 * Based on multimodalLiveApi.ts - converted to JavaScript
 */

// Response type constants
// Response type constants
export const MultimodalLiveResponseType = {
  TEXT: "TEXT",
  AUDIO: "AUDIO",
  SETUP_COMPLETE: "SETUP COMPLETE",
  INTERRUPTED: "INTERRUPTED",
  TURN_COMPLETE: "TURN COMPLETE",
  TOOL_CALL: "TOOL_CALL",
  ERROR: "ERROR",
  INPUT_TRANSCRIPTION: "INPUT_TRANSCRIPTION",
  OUTPUT_TRANSCRIPTION: "OUTPUT_TRANSCRIPTION",
  SESSION_RESUMPTION_UPDATE: "SESSION_RESUMPTION_UPDATE",
  GO_AWAY: "GO_AWAY",
  MESSAGE_LIMIT_WARNING: "MESSAGE_LIMIT_WARNING",
};

/**
 * Parses response messages from the Gemini Live API
 */
export class MultimodalLiveResponseMessage {
  constructor(data) {
    this.data = "";
    this.type = "";
    this.endOfTurn = false;

    console.log("raw message data: ", data);
    this.endOfTurn = data?.serverContent?.turnComplete;

    const parts = data?.serverContent?.modelTurn?.parts;

    try {
      if (data?.setupComplete) {
        console.log("SETUP COMPLETE response", data);
        this.type = MultimodalLiveResponseType.SETUP_COMPLETE;
      } else if (data?.serverContent?.turnComplete) {
        console.log("TURN COMPLETE response");
        this.type = MultimodalLiveResponseType.TURN_COMPLETE;
      } else if (data?.serverContent?.interrupted) {
        console.log("INTERRUPTED response");
        this.type = MultimodalLiveResponseType.INTERRUPTED;
      } else if (data?.serverContent?.inputTranscription) {
        console.log(
          "INPUT TRANSCRIPTION:",
          data.serverContent.inputTranscription
        );
        this.type = MultimodalLiveResponseType.INPUT_TRANSCRIPTION;
        this.data = {
          text: data.serverContent.inputTranscription.text || "",
          finished: data.serverContent.inputTranscription.finished || false,
        };
      } else if (data?.serverContent?.outputTranscription) {
        console.log(
          "OUTPUT TRANSCRIPTION:",
          data.serverContent.outputTranscription
        );
        this.type = MultimodalLiveResponseType.OUTPUT_TRANSCRIPTION;
        this.data = {
          text: data.serverContent.outputTranscription.text || "",
          finished: data.serverContent.outputTranscription.finished || false,
        };
      } else if (data?.toolCall) {
        console.log("TOOL CALL response", data?.toolCall);
        this.type = MultimodalLiveResponseType.TOOL_CALL;
        this.data = data?.toolCall;
      } else if (data?.sessionResumptionUpdate) {
        console.log("SESSION RESUMPTION UPDATE:", data.sessionResumptionUpdate);
        this.type = MultimodalLiveResponseType.SESSION_RESUMPTION_UPDATE;
        this.data = data.sessionResumptionUpdate;
      } else if (data?.goAway) {
        console.log("GO AWAY received:", data.goAway);
        this.type = MultimodalLiveResponseType.GO_AWAY;
        this.data = data.goAway;
      } else if (data?.messageLimitWarning) {
        console.warn("MESSAGE LIMIT WARNING:", data.messageLimitWarning);
        this.type = MultimodalLiveResponseType.MESSAGE_LIMIT_WARNING;
        this.data = data.messageLimitWarning;
      } else if (parts?.length && parts[0].text) {
        console.log("TEXT response", parts[0].text);
        this.data = parts[0].text;
        this.type = MultimodalLiveResponseType.TEXT;
      } else if (parts?.length && parts[0].inlineData) {
        console.log("AUDIO response");
        this.data = parts[0].inlineData.data;
        this.type = MultimodalLiveResponseType.AUDIO;
      }
    } catch {
      console.log("Error parsing response data: ", data);
    }
  }
}

/**
 * Function call definition for tool use
 */
export class FunctionCallDefinition {
  constructor(name, description, parameters, requiredParameters) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.requiredParameters = requiredParameters;
  }

  functionToCall(parameters) {
    console.log("Default function call");
  }

  getDefinition() {
    const definition = {
      name: this.name,
      description: this.description,
      parameters: { required: this.requiredParameters, ...this.parameters },
    };
    console.log("created FunctionDefinition: ", definition);
    return definition;
  }

  runFunction(parameters) {
    console.log(
      `Running ${this.name} function with parameters: ${JSON.stringify(
        parameters
      )}`
    );
    this.functionToCall(parameters);
  }
}

/**
 * Main Gemini Live API client
 */
export class GeminiLiveAPI {
  constructor() {
    this.responseModalities = ["AUDIO"];
    this.systemInstructions = "";
    this.googleGrounding = false;
    this.enableAffectiveDialog = true; // Default affective dialog
    this.voiceName = "Puck"; // Default voice
    this.temperature = 1.0; // Default temperature
    this.proactivity = { proactiveAudio: true }; // Proactivity config
    this.inputAudioTranscription = false;
    this.outputAudioTranscription = false;
    this.enableFunctionCalls = false;
    this.functions = [];
    this.functionsMap = {};
    this.previousImage = null;
    this.totalBytesSent = 0;

    // Automatic activity detection settings with defaults
    this.automaticActivityDetection = {
      disabled: false,
      silence_duration_ms: 2000,
      prefix_padding_ms: 500,
      end_of_speech_sensitivity: "END_SENSITIVITY_UNSPECIFIED",
      start_of_speech_sensitivity: "START_SENSITIVITY_UNSPECIFIED",
    };

    this.connected = false;
    this.webSocket = null;
    this.lastSetupMessage = null; // Store the last setup message
    this._pendingSessionToken = null; // Token to send after WebSocket opens

    // Session resumption state
    this._sessionHandle = null; // Current session handle for resumption
    this._resumptionToken = null; // Token to resume session
    this._lastAuthOptions = null; // Store auth options for reconnect
    this._autoReconnect = true; // Enable auto-reconnect by default
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 3;
    this._isReconnecting = false;

    // Default callbacks
    this.onReceiveResponse = (message) => {
      console.log("Default message received callback", message);
    };

    this.onConnectionStarted = () => {
      console.log("Default onConnectionStarted");
    };

    this.onErrorMessage = (message) => {
      console.error("[GeminiLiveAPI] Error:", message);
      alert(message);
      this.connected = false;
    };

    this.onOpen = () => { };
    this.onClose = () => { };
    this.onError = () => { };

    console.log("Created Gemini Live API object: ", this);
  }



  setSystemInstructions(newSystemInstructions) {
    console.log("setting system instructions: ", newSystemInstructions);
    this.systemInstructions = newSystemInstructions;
  }

  setGoogleGrounding(newGoogleGrounding) {
    console.log("setting google grounding: ", newGoogleGrounding);
    this.googleGrounding = newGoogleGrounding;
  }

  setResponseModalities(modalities) {
    this.responseModalities = modalities;
  }

  setVoice(voiceName) {
    console.log("setting voice: ", voiceName);
    this.voiceName = voiceName;
  }

  setProactivity(proactivity) {
    console.log("setting proactivity: ", proactivity);
    this.proactivity = proactivity;
  }

  setInputAudioTranscription(enabled) {
    console.log("setting input audio transcription: ", enabled);
    this.inputAudioTranscription = enabled;
  }

  setOutputAudioTranscription(enabled) {
    console.log("setting output audio transcription: ", enabled);
    this.outputAudioTranscription = enabled;
  }

  setEnableFunctionCalls(enabled) {
    console.log("setting enable function calls: ", enabled);
    this.enableFunctionCalls = enabled;
  }

  addFunction(newFunction) {
    this.functions.push(newFunction);
    this.functionsMap[newFunction.name] = newFunction;
    console.log("added function: ", newFunction);
  }

  callFunction(functionName, parameters) {
    const functionToCall = this.functionsMap[functionName];
    functionToCall.runFunction(parameters);
  }

  async connect(authOptions = {}) {
    try {
      // Store auth options for potential reconnect
      this._lastAuthOptions = authOptions;
      this._reconnectAttempts = 0;
      this._autoReconnect = true; // Re-enable auto-reconnect on fresh connect
      this._sessionHandle = null; // Clear old session
      this._resumptionToken = null;

      // 1. Authenticate via REST API
      const authPayload = {};

      // Add auth credentials based on what's provided
      if (authOptions.password) {
        authPayload.password = authOptions.password;
      }
      if (authOptions.jwtToken) {
        authPayload.jwt_token = authOptions.jwtToken;
      }
      if (authOptions.signedParams) {
        authPayload.signed_params = authOptions.signedParams;
      }
      if (authOptions.gdprConsent) {
        authPayload.gdpr_consent = authOptions.gdprConsent;
      }
      if (authOptions.lifterlmsUser) {
        authPayload.lifterlms_user = authOptions.lifterlmsUser;
      }

      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authPayload),
      });

      if (!response.ok) {
        const error = new Error("Authentication failed");
        error.status = response.status;
        throw error;
      }

      const data = await response.json();
      this._pendingSessionToken = data.session_token;

      // 2. Connect WebSocket WITHOUT token in URL (security improvement)
      // Token is sent as first message to avoid logging in browser history/DevTools
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      this.setupWebSocketToService(wsUrl);
    } catch (error) {
      console.error("Connection error:", error);
      // Re-throw to allow caller to handle UI (e.g. 429 modal)
      throw error;
    }
  }

  async _attemptReconnect() {
    if (!this._autoReconnect || this._isReconnecting) return;
    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      console.log("[GeminiLiveAPI] Max reconnect attempts reached");
      return;
    }
    if (!this._resumptionToken) {
      console.log("[GeminiLiveAPI] No resumption token available, cannot reconnect");
      return;
    }

    this._isReconnecting = true;
    this._reconnectAttempts++;
    console.log(`[GeminiLiveAPI] Attempting reconnect ${this._reconnectAttempts}/${this._maxReconnectAttempts}...`);

    try {
      // Re-authenticate
      const authPayload = {};
      if (this._lastAuthOptions?.password) authPayload.password = this._lastAuthOptions.password;
      if (this._lastAuthOptions?.jwtToken) authPayload.jwt_token = this._lastAuthOptions.jwtToken;
      if (this._lastAuthOptions?.signedParams) authPayload.signed_params = this._lastAuthOptions.signedParams;

      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authPayload),
      });

      if (!response.ok) {
        throw new Error("Re-authentication failed");
      }

      const data = await response.json();
      this._pendingSessionToken = data.session_token;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      this.setupWebSocketToService(wsUrl, true); // isReconnect = true
    } catch (error) {
      console.error("[GeminiLiveAPI] Reconnect failed:", error);
      this._isReconnecting = false;
    }
  }

  setAutoReconnect(enabled) {
    this._autoReconnect = enabled;
  }

  disconnect() {
    // Clear resumption state to prevent auto-reconnect on intentional disconnect
    this._resumptionToken = null;
    this._sessionHandle = null;
    this._autoReconnect = false;

    if (this.webSocket) {
      this.webSocket.close();
      this.connected = false;
    }
  }

  sendMessage(message) {
    console.log("🟩 Sending message: ", message);
    if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
      this.webSocket.send(JSON.stringify(message));
    }
  }

  onReceiveMessage(messageEvent) {
    console.log("Message received: ", messageEvent);

    // Handle binary audio data
    if (messageEvent.data instanceof ArrayBuffer) {
      const message = new MultimodalLiveResponseMessage({
        serverContent: {
          modelTurn: {
            parts: [{ inlineData: { data: messageEvent.data } }],
          },
        },
      });
      // Manually set type to AUDIO since the constructor expects JSON structure
      message.type = MultimodalLiveResponseType.AUDIO;
      message.data = messageEvent.data;
      this.onReceiveResponse(message);
      return;
    }

    try {
      const messageData = JSON.parse(messageEvent.data);

      // Handle session resumption updates internally
      if (messageData?.sessionResumptionUpdate) {
        const update = messageData.sessionResumptionUpdate;
        if (update.sessionId) {
          this._sessionHandle = update.sessionId;
        }
        if (update.token) {
          this._resumptionToken = update.token;
          console.log("[GeminiLiveAPI] Received resumption token, auto-reconnect enabled");
        }
        // Reset reconnect attempts on successful session update
        this._reconnectAttempts = 0;
      }

      // Handle GoAway - server is about to terminate connection
      if (messageData?.goAway) {
        console.log("[GeminiLiveAPI] GoAway received, preparing for reconnect...");
        // The connection will close soon, reconnect will be triggered automatically
      }

      // Handle message limit warning - proactively reconnect before limit hit
      if (messageData?.messageLimitWarning) {
        console.warn(`[GeminiLiveAPI] Message limit warning: ${messageData.messageLimitWarning.count}/${messageData.messageLimitWarning.limit}`);
        // If we have a resumption token, trigger proactive reconnect
        if (this._resumptionToken && !this._isReconnecting) {
          console.log("[GeminiLiveAPI] Triggering proactive reconnect before limit...");
          this.webSocket.close(); // Will trigger onclose -> _attemptReconnect
        }
      }

      const message = new MultimodalLiveResponseMessage(messageData);
      this.onReceiveResponse(message);
    } catch (parseError) {
      console.error("Failed to parse WebSocket message:", parseError);
      // Don't crash the handler - log and continue
    }
  }

  setupWebSocketToService(url, isReconnect = false) {
    console.log("connecting: ", url, isReconnect ? "(reconnect)" : "");

    this.webSocket = new WebSocket(url);
    this.webSocket.binaryType = "arraybuffer";

    this.webSocket.onclose = (event) => {
      console.log("websocket closed: ", event);
      const wasConnected = this.connected;
      this.connected = false;

      // Attempt reconnect if we were connected and have a resumption token
      if (wasConnected && this._resumptionToken && !this._isReconnecting) {
        console.log("[GeminiLiveAPI] Unexpected disconnect, attempting reconnect...");
        setTimeout(() => this._attemptReconnect(), 500);
      }

      if (this.onClose) this.onClose(event);
    };

    this.webSocket.onerror = (event) => {
      console.log("websocket error: ", event);
      this.connected = false;
      if (this.onError) this.onError(event);
    };

    this.webSocket.onopen = (event) => {
      console.log("websocket open: ", event);
      this.connected = true;
      this.totalBytesSent = 0;
      this._isReconnecting = false;

      // Send auth token as first message (security improvement - not in URL)
      if (this._pendingSessionToken) {
        this.sendMessage({ type: "auth", token: this._pendingSessionToken });
        this._pendingSessionToken = null; // Clear after sending
      }

      this.sendInitialSetupMessages(isReconnect);
      this.onConnectionStarted();
      if (this.onOpen) this.onOpen(event);
    };

    this.webSocket.onmessage = this.onReceiveMessage.bind(this);
  }

  getFunctionDefinitions() {
    console.log("getFunctionDefinitions called");
    const tools = [];

    for (let index = 0; index < this.functions.length; index++) {
      const func = this.functions[index];
      tools.push(func.getDefinition());
    }
    return tools;
  }

  sendInitialSetupMessages(isReconnect = false) {
    const tools = this.getFunctionDefinitions();

    const sessionSetupMessage = {
      setup: {

        generation_config: {
          response_modalities: this.responseModalities,
          temperature: this.temperature,
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: this.voiceName,
              },
            },
          },
        },
        system_instruction: { parts: [{ text: this.systemInstructions }] },
        tools: { function_declarations: tools },
        proactivity: this.proactivity,

        realtime_input_config: {
          automatic_activity_detection: this.automaticActivityDetection,
        },

        // Enable session resumption - tokens valid for 2 hours after disconnect
        session_resumption: { handle: this._sessionHandle },
      },
    };

    // If reconnecting with a resumption token, include it
    if (isReconnect && this._resumptionToken) {
      sessionSetupMessage.setup.session_resumption.token = this._resumptionToken;
      console.log("[GeminiLiveAPI] Reconnecting with resumption token");
    }

    // Add transcription config if enabled
    if (this.inputAudioTranscription) {
      sessionSetupMessage.setup.input_audio_transcription = {};
    }
    if (this.outputAudioTranscription) {
      sessionSetupMessage.setup.output_audio_transcription = {};
    }

    if (this.googleGrounding) {
      sessionSetupMessage.setup.tools.google_search = {};
      // Currently can't have both Google Search with custom tools.
      console.log(
        "Google Grounding enabled, removing custom function calls if any."
      );
      delete sessionSetupMessage.setup.tools.function_declarations;
    }

    // Add affective dialog if enabled
    if (this.enableAffectiveDialog) {
      sessionSetupMessage.setup.generation_config.enable_affective_dialog = true;
    }

    // Store the setup message for later access
    this.lastSetupMessage = sessionSetupMessage;

    console.log("sessionSetupMessage: ", sessionSetupMessage);
    this.sendMessage(sessionSetupMessage);
  }

  sendTextMessage(text) {
    const textMessage = {
      client_content: {
        turns: [
          {
            role: "user",
            parts: [{ text: text }],
          },
        ],
        turn_complete: true,
      },
    };
    this.sendMessage(textMessage);
  }

  sendToolResponse(toolCallId, response) {
    const message = {
      tool_response: {
        id: toolCallId,
        response: response,
      },
    };
    console.log("Sending tool response:", message);
    this.sendMessage(message);
  }

  sendRealtimeInputMessage(data, mime_type) {
    const message = {
      realtime_input: {
        media_chunks: [
          {
            mime_type: mime_type,
            data: data,
          },
        ],
      },
    };
    this.sendMessage(message);
    this.addToBytesSent(data);
  }

  addToBytesSent(data) {
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(data);
    this.totalBytesSent += encodedData.length;
  }

  getBytesSent() {
    return this.totalBytesSent;
  }

  sendAudioMessage(pcmData) {
    // Send binary audio data directly
    if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
      this.webSocket.send(pcmData);
      this.totalBytesSent += pcmData.byteLength;
    }
  }

  async sendImageMessage(base64Image, mime_type = "image/jpeg") {
    this.sendRealtimeInputMessage(base64Image, mime_type);
  }
}

console.log("loaded geminiLiveApi.js");
