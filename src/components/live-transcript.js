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

class LiveTranscript extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.transcriptHistory = []; // Store conversation for export
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  addInputTranscript(text, isFinal) {
    this.updateTranscript('user', text, isFinal);
  }

  addOutputTranscript(text, isFinal) {
    this.updateTranscript('model', text, isFinal);
  }

  finalizeAll() {
    const container = this.shadowRoot.querySelector('.transcript-container');
    if (!container) return;
    const activeBubbles = container.querySelectorAll('.bubble.temp');
    activeBubbles.forEach(b => {
      b.classList.remove('temp');
      b.dataset.role = null;
    });
  }

  clear() {
    const container = this.shadowRoot.querySelector('.transcript-container');
    if (container) {
      container.innerHTML = '';
    }
    this.transcriptHistory = [];
    this.updateCopyButton();
  }

  getTranscriptText() {
    // Build transcript from history for accurate ordering
    let lines = [];
    for (const entry of this.transcriptHistory) {
      const speaker = entry.role === 'user' ? 'You' : 'AI';
      lines.push(`${speaker}: ${entry.text}`);
    }
    return lines.join('\n\n');
  }

  async copyTranscript() {
    const text = this.getTranscriptText();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      const copyBtn = this.shadowRoot.querySelector('.copy-btn');
      if (copyBtn) {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = originalText;
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to copy transcript:', err);
    }
  }

  updateCopyButton() {
    const copyBtn = this.shadowRoot.querySelector('.copy-btn');
    if (copyBtn) {
      copyBtn.style.display = this.transcriptHistory.length > 0 ? 'flex' : 'none';
    }
  }

  updateTranscript(role, text, isFinal) {
    const container = this.shadowRoot.querySelector('.transcript-container');
    if (!container) return;

    // Finalize other roles (implicit turn switch)
    const activeBubbles = container.querySelectorAll('.bubble.temp');
    activeBubbles.forEach(b => {
      if (b.dataset.role !== role) {
        b.classList.remove('temp');
        b.dataset.role = null;
      }
    });

    // Find existing temporary bubble for this role
    let bubble = container.querySelector(`.bubble.temp[data-role="${role}"]`);

    if (!bubble) {
      // Create new bubble - also start a new history entry
      bubble = document.createElement('div');
      bubble.className = `bubble temp ${role}`;
      bubble.dataset.role = role;
      container.appendChild(bubble);

      // Start new history entry
      this.transcriptHistory.push({ role, text: '' });

      // Auto scroll
      container.scrollTop = container.scrollHeight;
    }

    // Intelligent spacing:
    // If we have content, and we're not starting/ending with space, check if we need one.
    const currentText = bubble.textContent;
    if (currentText.length > 0 && !currentText.endsWith(' ') && !text.startsWith(' ')) {
      // Check if starts with alphanumeric (approximate check for "word")
      if (/^[a-zA-Z0-9À-ÿ]/.test(text)) {
        bubble.appendChild(document.createTextNode(' '));
        // Also add space to history
        const lastEntry = this.transcriptHistory[this.transcriptHistory.length - 1];
        if (lastEntry && lastEntry.role === role) {
          lastEntry.text += ' ';
        }
      }
    }

    // Wrap new text in a span for animation
    const span = document.createElement('span');
    span.textContent = text;
    span.className = 'fade-span';
    bubble.appendChild(span);

    // Append to history
    const lastEntry = this.transcriptHistory[this.transcriptHistory.length - 1];
    if (lastEntry && lastEntry.role === role) {
      lastEntry.text += text;
    }

    // Update copy button visibility
    this.updateCopyButton();

    // Note: We ignore isFinal here because the backend might be sending it prematurely for chunks.
    // We rely on role-switching or explicit finalizeAll() calls to close bubbles.

    // Auto scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  render() {
    if (this.shadowRoot.innerHTML.trim() !== '') return;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          height: 100%;
          overflow: hidden;
          font-family: var(--font-body, system-ui, sans-serif);
          position: relative;
        }

        .transcript-wrapper {
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .transcript-header {
          display: flex;
          justify-content: flex-end;
          padding: 0.25rem 0.5rem;
          flex-shrink: 0;
        }

        .copy-btn {
          display: none;
          align-items: center;
          gap: 4px;
          background: rgba(0,0,0,0.05);
          border: none;
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--color-text-sub, #666);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .copy-btn:hover {
          background: rgba(0,0,0,0.1);
        }

        .copy-btn svg {
          width: 12px;
          height: 12px;
        }

        .transcript-container {
          flex: 1;
          overflow-y: auto;
          padding: 0.5rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          scroll-behavior: smooth;
          /* Subtle fade at edges only */
          mask-image: linear-gradient(to bottom, transparent 0px, black 10px, black calc(100% - 20px), transparent 100%);
          -webkit-mask-image: linear-gradient(to bottom, transparent 0px, black 10px, black calc(100% - 20px), transparent 100%);
        }

        /* Small spacer for scroll clearance */
        .transcript-container::after {
          content: "";
          display: block;
          min-height: 20px;
          flex-shrink: 0;
        }

        /* Bubble animation for the CONTAINER itself (optional, mainly for first appearance) */
        .bubble {
          max-width: 80%;
          padding: 0.5rem 1rem;
          font-size: 1.1rem;
          line-height: 1.5;
          animation: popIn 0.5s ease forwards;
          word-wrap: break-word;
          /* opacity handled by animation */
        }

        .fade-span {
          animation: fadeIn 1.5s ease forwards;
          opacity: 0;
        }

        .bubble.model {
          align-self: flex-start;
          color: #333; /* Dark text for model */
          text-align: left;
        }

        .bubble.user {
          align-self: flex-end;
          color: var(--color-accent-primary, #5c6b48); /* Accent color for user */
          text-align: right;
          font-weight: 500;
        }

        .bubble.temp {
          opacity: 0.7;
        }

        @keyframes popIn {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        @keyframes fadeIn {
          0% { opacity: 0; transform: translateY(5px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        /* Scrollbar styling - hidden for cleaner look or minimal */
        .transcript-container::-webkit-scrollbar {
          width: 0px; /* Hide scrollbar for seamless feel */
          background: transparent;
        }
      </style>
      <div class="transcript-wrapper">
        <div class="transcript-header">
          <button class="copy-btn" title="Copy transcript">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy
          </button>
        </div>
        <div class="transcript-container">
          <!-- Transcripts go here -->
        </div>
      </div>
    `;

    // Attach copy button handler
    const copyBtn = this.shadowRoot.querySelector('.copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => this.copyTranscript());
    }
  }
}

customElements.define('live-transcript', LiveTranscript);
