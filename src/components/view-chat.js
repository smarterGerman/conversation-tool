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

import "./audio-visualizer.js";
import "./live-transcript.js";
import {
  GeminiLiveAPI,
  MultimodalLiveResponseType,
  FunctionCallDefinition,
} from "../lib/gemini-live/geminilive.js";
import { AudioStreamer, AudioPlayer } from "../lib/gemini-live/mediaUtils.js";

// HTML escape function to prevent XSS
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Sanitize text for use in AI prompts to prevent prompt injection
function sanitizeForPrompt(text) {
  if (!text) return '';
  // Remove characters that could break out of quoted strings or inject instructions
  return text
    .replace(/["'`]/g, '') // Remove quotes that could break string boundaries
    .replace(/[\r\n]+/g, ' ') // Replace newlines with spaces
    .replace(/[{}[\]]/g, '') // Remove brackets that could inject structured data
    .trim()
    .slice(0, 500); // Limit length to prevent extremely long injections
}

class ViewChat extends HTMLElement {
  constructor() {
    super();
    this._mission = null;
  }

  set mission(value) {
    this._mission = value;
    this.render();
  }

  set language(value) {
    this._language = value;
  }

  set mode(value) {
    this._mode = value;
  }

  connectedCallback() {
    this.render();
  }

  disconnectedCallback() {
    if (this.audioStreamer) this.audioStreamer.stop();
    if (this.client) this.client.disconnect();
  }

  render() {
    if (!this._mission) return; // Wait for mission prop

    this.innerHTML = `

 <button id="back-to-missions" style="
            position: absolute;
            top: var(--spacing-md);
            left: var(--spacing-md);
            background: transparent;
            float: left;
            border: none;
            cursor: pointer;
            padding: 8px;
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            opacity: 0.7;
            transition: opacity 0.2s;
            z-index: 10;
        " onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        </button>

        <!-- Transcript Toggle -->
        <button id="transcript-toggle" style="
            position: absolute;
            top: var(--spacing-md);
            right: var(--spacing-md);
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 8px;
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            opacity: 0.5;
            transition: opacity 0.2s;
            z-index: 10;
        " onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=${localStorage.getItem('immergo_transcript') === 'true' ? '0.9' : '0.5'}" title="Toggle transcript">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
        </button>

      <div class="container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; position: relative; overflow: hidden; padding: var(--spacing-lg); gap: var(--spacing-md);">

        <div style="text-align: center;">
          <p style="font-size: 0.85rem; color: var(--color-text-sub); margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.05em;">${escapeHtml(this._mission.target_role) || "Target Person"}</p>
          <h2 style="font-size: 1.3rem; font-weight: bold; color: var(--braun-black); margin: 0;">${escapeHtml(this._mission.title)}</h2>
          <p style="font-size: 0.9rem; color: var(--braun-dark); margin: 8px 0 0 0; max-width: 400px;">${escapeHtml(this._mission.desc)}</p>
        </div>

        <div style="display: flex; flex-direction: column; align-items: center; width: 100%; max-width: 500px; gap: var(--spacing-sm);">
          <!-- Model Visualizer -->
          <div style="width: 100%; height: 60px;">
             <audio-visualizer id="model-viz"></audio-visualizer>
          </div>

          <!-- Transcript (toggleable) -->
          <div id="transcript-container" style="width: 100%; height: 200px; position: relative; display: ${localStorage.getItem('immergo_transcript') === 'true' ? 'block' : 'none'};">
            <live-transcript></live-transcript>
          </div>

          <!-- User Visualizer -->
          <div style="width: 100%; height: 60px;">
             <audio-visualizer id="user-viz"></audio-visualizer>
          </div>
        </div>

        <style>
          .chat-cta-btn {
            background: var(--braun-orange);
            color: white;
            padding: 14px 32px;
            border-radius: var(--radius-md);
            border: none;
            box-shadow: var(--shadow-raised);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            cursor: pointer;
            transition: all 0.15s ease;
            font-family: var(--font-body);
          }

          .chat-cta-btn:hover {
            filter: brightness(1.1);
            box-shadow: var(--shadow-lg);
          }

          .chat-cta-btn:active {
            box-shadow: var(--shadow-pressed);
          }

          .chat-cta-btn.active {
            background: var(--braun-dark);
            color: var(--braun-white);
          }
        </style>

        <div style="display: flex; flex-direction: column; gap: var(--spacing-xs); align-items: center;">
           <button id="mic-btn" class="chat-cta-btn">
            <span style="font-size: 1rem; font-weight: 800; letter-spacing: 0.02em;">Start Conversation</span>
          </button>
           <p id="connection-status" style="
             margin: 0;
             font-size: 0.75rem;
             font-weight: 600;
             height: 1.2em;
             color: var(--color-text-sub);
           "></p>
        </div>

        <!-- Rate Limit Dialog -->
        <div id="rate-limit-dialog" class="hidden" style="
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.6);
            backdrop-filter: blur(4px);
            z-index: 20;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
        ">
            <div style="background: var(--braun-white); color: var(--braun-black); padding: var(--spacing-xl); border-radius: var(--radius-lg); max-width: 400px; text-align: center; box-shadow: var(--shadow-lg);">
                <h3 style="margin-bottom: var(--spacing-sm); color: var(--braun-dark);">Service Busy</h3>
                <p style="margin-bottom: var(--spacing-lg); line-height: 1.5; color: var(--color-text-sub);">
                    Too many conversations happening right now. Please try again in a moment.
                </p>
                <button id="close-rate-limit" style="
                    background: var(--braun-orange);
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: var(--radius-md);
                    cursor: pointer;
                    font-weight: 700;
                    box-shadow: var(--shadow-raised);
                ">OK</button>
            </div>
        </div>

        <!-- Password Dialog -->
        <div id="password-dialog" class="hidden" style="
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.6);
            backdrop-filter: blur(4px);
            z-index: 20;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
        ">
            <div style="background: var(--braun-white); color: var(--braun-black); padding: var(--spacing-xl); border-radius: var(--radius-lg); max-width: 400px; text-align: center; box-shadow: var(--shadow-lg);">
                <h3 style="margin-bottom: var(--spacing-sm); color: var(--braun-dark);">Access Required</h3>
                <p style="margin-bottom: var(--spacing-md); line-height: 1.5; color: var(--color-text-sub);">
                    Enter your access password to start practicing.
                </p>
                <form id="password-form" autocomplete="on">
                  <input type="text" name="username" autocomplete="username" value="student" style="
                      position: absolute;
                      left: -9999px;
                      width: 1px;
                      height: 1px;
                  " tabindex="-1" aria-hidden="true">
                  <input id="password-input" type="password" placeholder="Password" autocomplete="current-password" style="
                      width: 100%;
                      padding: 12px 16px;
                      border: 2px solid var(--braun-mid);
                      border-radius: var(--radius-md);
                      font-size: 1rem;
                      margin-bottom: var(--spacing-md);
                      box-sizing: border-box;
                  ">
                  <p id="password-error" class="hidden" style="color: var(--braun-orange); font-size: 0.85rem; margin-bottom: var(--spacing-sm);">
                      Incorrect password. Please try again.
                  </p>
                  <div style="display: flex; gap: var(--spacing-sm);">
                      <button type="button" id="cancel-password" style="
                          flex: 1;
                          background: var(--braun-light);
                          color: var(--braun-dark);
                          border: none;
                          padding: 12px 24px;
                          border-radius: var(--radius-md);
                          cursor: pointer;
                          font-weight: 700;
                      ">Cancel</button>
                      <button type="submit" id="submit-password" style="
                          flex: 1;
                          background: var(--braun-orange);
                          color: white;
                          border: none;
                          padding: 12px 24px;
                          border-radius: var(--radius-md);
                          cursor: pointer;
                          font-weight: 700;
                          box-shadow: var(--shadow-raised);
                      ">Submit</button>
                  </div>
                </form>
            </div>
        </div>

      </div>
    `;

    const rateLimitDialog = this.querySelector("#rate-limit-dialog");
    const closeRateLimitBtn = this.querySelector("#close-rate-limit");

    closeRateLimitBtn.addEventListener("click", () => {
      rateLimitDialog.classList.add("hidden");
      rateLimitDialog.style.display = "none";
    });

    // Password dialog elements
    const passwordDialog = this.querySelector("#password-dialog");
    const passwordInput = this.querySelector("#password-input");
    const passwordError = this.querySelector("#password-error");
    const cancelPasswordBtn = this.querySelector("#cancel-password");
    const submitPasswordBtn = this.querySelector("#submit-password");

    // Password handling - keep password in memory only, not in storage
    // Store only a success flag in sessionStorage (not the actual password)
    let sessionPassword = ""; // Keep password in memory only during page session
    let hasAuthenticatedThisSession = sessionStorage.getItem("sg_auth_success") === "true";
    let passwordRequired = false;
    let courseAuthEnabled = false;


    // Check for JWT or signed URL params (for course platform integration)
    const urlParams = new URLSearchParams(window.location.search);
    const jwtToken = urlParams.get("jwt") || urlParams.get("token");
    const signedUrlParams = urlParams.get("user") ? {
      user: urlParams.get("user"),
      exp: urlParams.get("exp"),
      sig: urlParams.get("sig"),
      course: urlParams.get("course") || ""
    } : null;

    // If we have course auth params, we can skip password
    const hasCourseAuth = !!(jwtToken || signedUrlParams);

    // Check if password is required from API status
    fetch("/api/status")
      .then((res) => res.json())
      .then((status) => {
        passwordRequired = status.password_required || false;
        courseAuthEnabled = status.course_auth_enabled || false;

        // If we have valid course auth, password is not required
        if (hasCourseAuth && courseAuthEnabled) {
          passwordRequired = false;
        }
      })
      .catch(() => {});

    cancelPasswordBtn.addEventListener("click", () => {
      passwordDialog.classList.add("hidden");
      passwordDialog.style.display = "none";
      passwordInput.value = "";
      passwordError.classList.add("hidden");
    });

    // Helper to request password
    const passwordForm = this.querySelector("#password-form");
    const requestPassword = () => {
      return new Promise((resolve, reject) => {
        passwordDialog.classList.remove("hidden");
        passwordDialog.style.display = "flex";
        passwordInput.value = "";
        passwordError.classList.add("hidden");
        passwordInput.focus();

        const handleSubmit = (e) => {
          if (e) e.preventDefault();
          const pw = passwordInput.value.trim();
          if (pw) {
            sessionPassword = pw; // Keep in memory only, not in storage
            passwordDialog.classList.add("hidden");
            passwordDialog.style.display = "none";
            passwordForm.removeEventListener("submit", handleSubmit);
            passwordInput.removeEventListener("keydown", handleKeydown);
            resolve(pw);
          }
        };

        const handleKeydown = (e) => {
          if (e.key === "Escape") {
            cancelPasswordBtn.click();
            reject(new Error("Password entry cancelled"));
          }
        };

        passwordForm.addEventListener("submit", handleSubmit);
        passwordInput.addEventListener("keydown", handleKeydown);

        // Update cancel to reject
        const handleCancel = () => {
          cancelPasswordBtn.removeEventListener("click", handleCancel);
          passwordForm.removeEventListener("submit", handleSubmit);
          passwordInput.removeEventListener("keydown", handleKeydown);
          reject(new Error("Password entry cancelled"));
        };
        cancelPasswordBtn.addEventListener("click", handleCancel, { once: true });
      });
    };

    // Helper to show password error
    const showPasswordError = () => {
      sessionPassword = "";
      hasAuthenticatedThisSession = false;
      sessionStorage.removeItem("sg_auth_success");
      passwordError.classList.remove("hidden");
      passwordDialog.classList.remove("hidden");
      passwordDialog.style.display = "flex";
      passwordInput.value = "";
      passwordInput.focus();
    };

    // Helper to perform navigation
    const doEndSession = () => {
      // Clear session warning timer
      if (this._sessionWarningTimer) {
        clearTimeout(this._sessionWarningTimer);
        this._sessionWarningTimer = null;
      }

      // Capture transcript before cleanup
      const transcriptEl = this.querySelector("live-transcript");
      const transcript = transcriptEl ? transcriptEl.getTranscriptText() : "";

      // Cleanup Gemini session
      if (this.audioStreamer) this.audioStreamer.stop();
      if (this.client) this.client.disconnect();
      if (this.audioPlayer) this.audioPlayer.interrupt(); // Stop playback

      // Disconnect visualizers
      const userViz = this.querySelector("#user-viz");
      const modelViz = this.querySelector("#model-viz");
      if (userViz && userViz.disconnect) userViz.disconnect();
      if (modelViz && modelViz.disconnect) modelViz.disconnect();

      console.log("👋 [App] Session ended by user");

      // Incomplete session with transcript
      const result = {
        incomplete: true,
        transcript: transcript,
      };

      this.dispatchEvent(
        new CustomEvent("navigate", {
          bubbles: true,
          detail: { view: "summary", result: result },
        })
      );
    };

    // Back Button
    const backBtn = this.querySelector("#back-to-missions");
    backBtn.addEventListener("click", () => {
      // Stop session if active
      if (this.audioStreamer) this.audioStreamer.stop();
      if (this.client) this.client.disconnect();
      if (this.audioPlayer) this.audioPlayer.interrupt();

      const userViz = this.querySelector("#user-viz");
      const modelViz = this.querySelector("#model-viz");
      if (userViz && userViz.disconnect) userViz.disconnect();
      if (modelViz && modelViz.disconnect) modelViz.disconnect();

      // Navigate back to mission selector
      this.dispatchEvent(
        new CustomEvent("navigate", {
          bubbles: true,
          detail: { view: "mission-selector" },
        })
      );
    });

    // Transcript Toggle
    const transcriptToggle = this.querySelector("#transcript-toggle");
    const transcriptContainer = this.querySelector("#transcript-container");
    const updateTranscriptToggleStyle = () => {
      const isVisible = localStorage.getItem('immergo_transcript') === 'true';
      transcriptToggle.style.opacity = isVisible ? '0.9' : '0.5';
      transcriptToggle.style.background = isVisible ? 'rgba(0,0,0,0.05)' : 'transparent';
    };
    updateTranscriptToggleStyle();

    transcriptToggle.addEventListener("click", () => {
      const isCurrentlyVisible = localStorage.getItem('immergo_transcript') === 'true';
      const newState = !isCurrentlyVisible;
      localStorage.setItem('immergo_transcript', newState.toString());
      transcriptContainer.style.display = newState ? 'block' : 'none';
      updateTranscriptToggleStyle();
    });

    // Animate visualizer on click
    const userViz = this.querySelector("#user-viz");
    const modelViz = this.querySelector("#model-viz");
    const micBtn = this.querySelector("#mic-btn");
    const statusEl = this.querySelector("#connection-status");
    let isSpeaking = false;

    // Initialize Gemini Live
    this.client = new GeminiLiveAPI();
    this.audioStreamer = new AudioStreamer(this.client);
    this.audioPlayer = new AudioPlayer();

    // Define Mission Complete Tool
    const completeMissionTool = new FunctionCallDefinition(
      "complete_mission",
      "Call this tool when the user says goodbye or clearly wants to end the conversation. Provide 3 feedback points.",
      {
        type: "OBJECT",
        properties: {
          feedback_pointers: {
            type: "ARRAY",
            items: { type: "STRING" },
            description:
              "List of 3 specific feedback points in English: what they did well and what to improve.",
          },
        },
        required: ["feedback_pointers"],
      },
      ["feedback_pointers"]
    );

    completeMissionTool.functionToCall = (args) => {
      console.log("🏆 [App] Mission Complete Tool Triggered!", args);

      // Play winner sound immediately
      const winnerSound = new Audio("/winner-bell.mp3");
      winnerSound.volume = 0.6;
      winnerSound
        .play()
        .catch((e) => console.error("Failed to play winner sound:", e));

      console.log(
        "⏳ [App] Waiting for final audio to play before ending session..."
      );

      // Delay cleanup to allow the agent's congratulatory message to be heard
      setTimeout(() => {
        // Clear session warning timer
        if (this._sessionWarningTimer) {
          clearTimeout(this._sessionWarningTimer);
          this._sessionWarningTimer = null;
        }

        // Capture transcript before cleanup
        const transcriptEl = this.querySelector("live-transcript");
        const transcript = transcriptEl ? transcriptEl.getTranscriptText() : "";

        // Cleanup
        if (this.audioStreamer) this.audioStreamer.stop();
        if (this.client) this.client.disconnect();
        if (this.audioPlayer) this.audioPlayer.interrupt();

        // Navigate to summary with transcript
        const result = {
          notes: args.feedback_pointers,
          transcript: transcript,
        };

        this.dispatchEvent(
          new CustomEvent("navigate", {
            bubbles: true,
            detail: { view: "summary", result: result },
          })
        );
      }, 2500); // 2.5 seconds delay
    };

    this.client.addFunction(completeMissionTool);

    // Setup client callbacks for logging
    this.client.onConnectionStarted = () => {
      console.log("[Gemini] Connection started");
    };

    this.client.onOpen = () => {
      console.log("[Gemini] WebSocket connection opened");
    };

    this.client.onReceiveResponse = (response) => {
      console.log("[Gemini] Received response:", response.type);
      if (response.type === MultimodalLiveResponseType.AUDIO) {
        this.audioPlayer.play(response.data);
      } else if (response.type === MultimodalLiveResponseType.TURN_COMPLETE) {
        console.log("[Gemini] Turn complete");
        const transcriptEl = this.querySelector("live-transcript");
        if (transcriptEl) {
          transcriptEl.finalizeAll();
        }
      } else if (response.type === MultimodalLiveResponseType.TOOL_CALL) {
        console.log("[Gemini] Tool Call received:", response.data);
        if (response.data.functionCalls) {
          response.data.functionCalls.forEach((fc) => {
            this.client.callFunction(fc.name, fc.args);
          });
        }
      } else if (
        response.type === MultimodalLiveResponseType.INPUT_TRANSCRIPTION
      ) {
        const transcriptEl = this.querySelector("live-transcript");
        if (transcriptEl) {
          transcriptEl.addInputTranscript(
            response.data.text,
            response.data.finished
          );
        }
      } else if (
        response.type === MultimodalLiveResponseType.OUTPUT_TRANSCRIPTION
      ) {
        const transcriptEl = this.querySelector("live-transcript");
        if (transcriptEl) {
          transcriptEl.addOutputTranscript(
            response.data.text,
            response.data.finished
          );
        }
      } else if (
        response.type === MultimodalLiveResponseType.MESSAGE_LIMIT_WARNING
      ) {
        // Play warning bell ~10 seconds before session ends
        console.log("[App] Message limit warning - playing warning bell");
        const warningSound = new Audio("/start-bell.mp3");
        warningSound.volume = 0.4;
        warningSound.play().catch((e) => console.error("Failed to play warning sound:", e));
        // Update status to warn user
        statusEl.textContent = "Session ending soon...";
        statusEl.style.color = "var(--braun-orange)";
      }
    };

    this.client.onError = (error) => {
      console.error("[Gemini] Error:", error);
    };

    this.client.onClose = () => {
      console.log("[Gemini] Connection closed");
    };

    micBtn.addEventListener("click", async () => {
      isSpeaking = !isSpeaking;

      if (isSpeaking) {
        micBtn.classList.add('active');
        // Change to Stop/Listening state
        micBtn.innerHTML = `<span style="font-size: 1rem; font-weight: 800; letter-spacing: 0.02em;">End Conversation</span>`;
      } else {
        // Was active, so stopping now
        micBtn.classList.remove('active');
        doEndSession();
        return; // Stop here, don't execute start logic
      }

      if (isSpeaking) {
        console.log("[App] Microphone button clicked: Starting session...");
        statusEl.textContent = "Connecting...";
        statusEl.style.color = "var(--color-text-sub)";
        // Viz active handled by connection now

        try {
          // 0. Configure System Instructions
          const language = this._language || "French";
          const mode = this._mode || "immergo_immersive";
          // Sanitize mission data to prevent prompt injection attacks
          const missionTitle = sanitizeForPrompt(
            this._mission ? this._mission.title : "General Conversation"
          );
          const missionDesc = sanitizeForPrompt(
            this._mission ? this._mission.desc : ""
          );
          const targetRole = sanitizeForPrompt(
            this._mission
              ? this._mission.target_role || "a local native speaker"
              : "a conversational partner"
          );

          const cefrLevel = this._mission ? this._mission.level : "B1";

          // Build level-specific pacing instruction
          let pacingInstruction = "";
          if (cefrLevel === "A1" || cefrLevel === "A2") {
            pacingInstruction = "Speak German slowly with simple sentences and basic vocabulary. Pause between phrases. If they struggle, offer the word they need.";
          } else if (cefrLevel === "B1") {
            pacingInstruction = "Speak German naturally with common expressions and moderate complexity. If they make errors, respond naturally first, then briefly suggest a better phrasing.";
          } else {
            // B2, C1
            pacingInstruction = "Speak German as a native would - natural pace, idioms, nuanced expressions. Challenge them with complex topics and unexpected turns.";
          }

          // Unified prompt - no mode distinction
          const systemInstruction = `You are ${targetRole}, a native German speaker. The user (English native, CEFR ${cefrLevel}) is practicing: "${missionTitle}" (${missionDesc}).

START THE CONVERSATION: Greet the user in character and set up the scenario. Don't wait for them to speak first.

Stay in character speaking German. Wait for user to finish before responding. If user asks a question (in any language), answer helpfully, then continue the roleplay.

${pacingInstruction}

Keep expanding the roleplay - add complications, ask personal questions, explore tangential topics that would naturally come up. There's always more to discuss: ask follow-up questions, introduce new elements, explore related scenarios. The conversation is a playground for practice.

If user is silent for 30+ seconds, ask if they want to continue or end.

Only call complete_mission when:
- User says goodbye or clearly wants to end
- Conversation has run 5+ minutes with substantial practice

When ending: Brief goodbye in character, then call complete_mission with 3 specific feedback points in English (what they did well, what to improve).`;

          console.log(
            "[App] Setting system instructions for",
            language,
            "Mode:",
            mode
          );
          this.client.setSystemInstructions(systemInstruction);

          // Always enable transcription (toggle only controls visibility, not capture)
          // This ensures transcript is available even if user toggles mid-session
          this.client.setInputAudioTranscription(true);
          this.client.setOutputAudioTranscription(true);

          // Clear previous transcript when starting new session
          const transcriptEl = this.querySelector("live-transcript");
          if (transcriptEl && transcriptEl.clear) {
            transcriptEl.clear();
          }

          // 1. Connect to WebSocket
          console.log("🔌 [App] Connecting to backend...");

          // Check if password is required and get it
          // Skip password for users with course auth (signed URL or JWT)
          // Also skip if already authenticated this session (but still no password in memory)
          if (passwordRequired && !hasCourseAuth && !sessionPassword && !hasAuthenticatedThisSession) {
            try {
              await requestPassword();
            } catch (err) {
              console.log("Password entry cancelled");
              isSpeaking = false;
              micBtn.classList.remove('active');
              micBtn.innerHTML = `<span style="font-size: 1rem; font-weight: 800; letter-spacing: 0.02em;">Start Conversation</span>`;
              userViz.disconnect();
              modelViz.disconnect();
              statusEl.textContent = "";
              return;
            }
          }

          // Pass auth credentials based on what's available
          // Note: reCAPTCHA removed - all users authenticate via JWT (bypasses reCAPTCHA)
          const authOptions = {
            password: passwordRequired ? sessionPassword : null,
            jwtToken: hasCourseAuth ? jwtToken : null,
            signedParams: hasCourseAuth ? signedUrlParams : null
          };
          await this.client.connect(null, authOptions);

          // Mark auth success (without storing password)
          if (passwordRequired && sessionPassword) {
            hasAuthenticatedThisSession = true;
            sessionStorage.setItem("sg_auth_success", "true");
          }

          // 2. Start Audio Stream
          console.log("[App] Starting audio stream...");
          await this.audioStreamer.start();

          // Connect User Visualizer
          if (this.audioStreamer.audioContext && this.audioStreamer.source) {
            userViz.connect(
              this.audioStreamer.audioContext,
              this.audioStreamer.source
            );
          }

          // 3. Initialize Audio Player
          console.log("[App] Initializing audio player...");
          await this.audioPlayer.init();

          // Connect Model Visualizer
          if (this.audioPlayer.audioContext && this.audioPlayer.gainNode) {
            modelViz.connect(
              this.audioPlayer.audioContext,
              this.audioPlayer.gainNode
            );
          }

          console.log("[App] Session active!");
          statusEl.textContent = "Connected and ready to speak";
          statusEl.style.color = "#4CAF50"; // Success green

          // Play start sound
          const startSound = new Audio("/start-bell.mp3");
          startSound.volume = 0.6;
          startSound
            .play()
            .catch((e) => console.error("Failed to play start sound:", e));

          // Set timer for warning bell at 2:30 (150 seconds) - ~30 sec before typical 3 min cutoff
          this._sessionWarningTimer = setTimeout(() => {
            console.log("[App] Session time warning - 2:30 reached");
            const warningSound = new Audio("/start-bell.mp3");
            warningSound.volume = 0.4;
            warningSound.play().catch((e) => console.error("Failed to play warning sound:", e));
            statusEl.textContent = "Session ending soon...";
            statusEl.style.color = "var(--braun-orange)";
          }, 150000); // 150 seconds = 2:30
        } catch (err) {
          console.error("[App] Failed to start session:", err);
          console.log("Error status:", err.status); // Debug status

          isSpeaking = false;
          micBtn.classList.remove('active');
          // Reset button content to "Start Mission"
          micBtn.innerHTML = `
              <span style="font-size: 1.3rem; font-weight: 800; margin-bottom: 2px; letter-spacing: 0.02em;">Start Mission</span>
              <span style="font-size: 0.85rem; opacity: 0.9; font-style: italic;">You start the conversation!</span>
          `;

          userViz.disconnect();
          modelViz.disconnect();
          statusEl.textContent = "";

          if (err.status === 429) {
            rateLimitDialog.classList.remove("hidden");
            rateLimitDialog.style.display = "flex";
          } else if (err.status === 403) {
            // Session expired or invalid credentials - redirect to login
            sessionStorage.removeItem("sg_auth_success");
            const errorMsg = encodeURIComponent("Your session has expired. Please log in again.");
            window.location.href = `/?error=session_expired&message=${errorMsg}`;
          } else {
            alert("Failed to start session: " + err.message);
          }
        }
      }
    });
  }

}

customElements.define("view-chat", ViewChat);
