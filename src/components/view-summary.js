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

class ViewSummary extends HTMLElement {
  constructor() {
    super();
    this._result = null;
  }

  set result(value) {
    this._result = value;
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  render() {
    if (!this._result) return;

    if (this._result.incomplete) {
      this.innerHTML = `
          <div class="container text-center">
            <h2 style="margin-top: var(--spacing-xl); color: var(--color-text-sub);">Mission Ended</h2>

            <div style="margin: var(--spacing-xxl) 0; opacity: 0.7;">
                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                <p style="margin-top: var(--spacing-md); font-size: 1.1rem;">
                    Session ended early.<br>
                    Keep practicing!
                </p>
            </div>

            ${this._renderTranscript()}

            <button id="home-btn" class="btn-primary" style="margin-top: var(--spacing-xl);">Try another scenario</button>
          </div>
        `;
    } else {
      this.innerHTML = `
          <div class="container text-center">
            <h2 style="margin-top: var(--spacing-xl); color: var(--color-accent-secondary);">Well done!</h2>

            <div class="card" style="text-align: left; margin-top: var(--spacing-lg);">
              <h4 style="border-bottom: 2px solid var(--color-bg); padding-bottom: var(--spacing-sm);">Feedback</h4>
              <ul style="padding-left: var(--spacing-lg); color: var(--color-text-sub);">
                ${this._result.notes.map(note => `<li>${note}</li>`).join('')}
              </ul>
            </div>

            ${this._renderTranscript()}

            <button id="home-btn" class="btn-primary" style="margin-top: var(--spacing-xl);">Try another scenario</button>
          </div>
        `;
    }

    // Add common button style if not in CSS, or duplicate online styles for now to be safe as I see inline styles used before
    const btn = this.querySelector('#home-btn');
    btn.style.cssText = `
        background: var(--color-accent-primary);
        color: white;
        padding: 20px var(--spacing-xl);
        font-size: 1.25rem;
        font-weight: 800;
        border-radius: var(--radius-lg);
        width: 100%;
        margin-bottom: var(--spacing-xxl);
        box-shadow: 0 10px 20px -5px rgba(0,0,0,0.3);
        border: 1px solid rgba(255,255,255,0.1);
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    `;

    btn.onmouseover = () => {
      btn.style.transform = 'translateY(-4px) scale(1.01)';
      btn.style.boxShadow = '0 15px 30px -10px rgba(163, 177, 138, 0.4)';
      btn.style.filter = 'brightness(1.1)';
    };
    btn.onmouseout = () => {
      btn.style.transform = 'translateY(0) scale(1)';
      btn.style.boxShadow = '0 10px 20px -5px rgba(0,0,0,0.3)';
      btn.style.filter = 'brightness(1)';
    };

    btn.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('navigate', {
        bubbles: true,
        detail: { view: 'missions', mission: null, result: null }
      }));
    });

    // Attach copy transcript handler if transcript exists
    const copyBtn = this.querySelector('#copy-transcript-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(this._result.transcript);
          const originalText = copyBtn.innerHTML;
          copyBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Copied!
          `;
          setTimeout(() => {
            copyBtn.innerHTML = originalText;
          }, 2000);
        } catch (err) {
          console.error('Failed to copy transcript:', err);
        }
      });

      // Hover effect
      copyBtn.addEventListener('mouseover', () => {
        copyBtn.style.background = 'rgba(0,0,0,0.1)';
      });
      copyBtn.addEventListener('mouseout', () => {
        copyBtn.style.background = 'rgba(0,0,0,0.05)';
      });
    }
  }
  _renderTranscript() {
    if (!this._result.transcript) {
      return '';
    }

    return `
      <div class="card" style="text-align: left; margin-top: var(--spacing-lg);">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--color-bg); padding-bottom: var(--spacing-sm); margin-bottom: var(--spacing-sm);">
          <h4 style="margin: 0;">Conversation Transcript</h4>
          <button id="copy-transcript-btn" style="
            display: flex;
            align-items: center;
            gap: 4px;
            background: rgba(0,0,0,0.05);
            border: none;
            border-radius: 4px;
            padding: 6px 12px;
            font-size: 0.8rem;
            font-weight: 600;
            color: var(--color-text-sub);
            cursor: pointer;
            transition: all 0.15s ease;
          ">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy
          </button>
        </div>
        <div id="transcript-content" style="
          max-height: 200px;
          overflow-y: auto;
          font-size: 0.9rem;
          line-height: 1.6;
          color: var(--color-text-sub);
          white-space: pre-wrap;
          word-wrap: break-word;
          background: var(--color-bg-alt);
          padding: var(--spacing-md);
          border-radius: var(--radius-sm);
        ">${this._escapeHtml(this._result.transcript)}</div>
      </div>
    `;
  }

  _escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

}

customElements.define('view-summary', ViewSummary);
