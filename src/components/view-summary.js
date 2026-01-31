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
    this._evaluation = null;
    this._evaluationError = null;
    this._isLoading = true;
  }

  set result(value) {
    this._result = value;
    this._isLoading = true;
    this._evaluation = null;
    this._evaluationError = null;
    this.render();
    this._fetchEvaluation();
  }

  connectedCallback() {
    this.render();
  }

  async _fetchEvaluation() {
    if (!this._result?.transcript) {
      this._isLoading = false;
      this._evaluationError = "No transcript available";
      this.render();
      return;
    }

    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: this._result.transcript,
          mission: this._result.mission || ""
        })
      });

      if (!response.ok) {
        throw new Error(`Evaluation failed: ${response.status}`);
      }

      const data = await response.json();
      this._evaluation = data.evaluation;
      this._isLoading = false;
      this.render();
    } catch (error) {
      console.error("Evaluation error:", error);
      this._evaluationError = error.message;
      this._isLoading = false;
      this.render();
    }
  }

  render() {
    if (!this._result) return;

    const isIncomplete = this._result.incomplete;
    const title = isIncomplete ? "Session Ended" : "Well done!";
    const titleColor = isIncomplete ? "var(--color-text-sub)" : "var(--color-accent-secondary)";

    this.innerHTML = `
      <div class="container text-center">
        <h2 style="margin-top: var(--spacing-xl); color: ${titleColor};">${title}</h2>

        ${this._renderEvaluation()}

        ${this._renderTranscript()}

        <button id="home-btn" class="btn-primary" style="margin-top: var(--spacing-xl);">Try another scenario</button>
      </div>
    `;

    this._attachEventListeners();
  }

  _renderEvaluation() {
    if (this._isLoading) {
      return `
        <div class="card" style="text-align: center; margin-top: var(--spacing-lg); padding: var(--spacing-xl);">
          <div class="loading-spinner" style="
            width: 40px;
            height: 40px;
            border: 3px solid var(--color-bg-alt);
            border-top-color: var(--color-accent-primary);
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto var(--spacing-md);
          "></div>
          <p style="color: var(--color-text-sub); margin: 0;">Analyzing your conversation...</p>
          <style>
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          </style>
        </div>
      `;
    }

    if (this._evaluationError) {
      return `
        <div class="card" style="text-align: left; margin-top: var(--spacing-lg);">
          <p style="color: var(--color-text-sub);">Evaluation unavailable. Keep practicing!</p>
        </div>
      `;
    }

    if (!this._evaluation) {
      return '';
    }

    const e = this._evaluation;
    const overallScore = e.overall_score || 0;
    const scoreColor = overallScore >= 8 ? '#4CAF50' : overallScore >= 6 ? '#FF9800' : '#f44336';

    return `
      <div class="card" style="text-align: left; margin-top: var(--spacing-lg);">
        <!-- Overall Score -->
        <div style="text-align: center; margin-bottom: var(--spacing-lg); padding-bottom: var(--spacing-md); border-bottom: 2px solid var(--color-bg);">
          <div style="font-size: 3rem; font-weight: bold; color: ${scoreColor};">${overallScore}/10</div>
          <div style="color: var(--color-text-sub); font-size: 0.9rem;">Overall Score</div>
        </div>

        <!-- Score Grid -->
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--spacing-md); margin-bottom: var(--spacing-lg);">
          ${this._renderScoreCard('Grammar', e.grammar)}
          ${this._renderScoreCard('Vocabulary', e.vocabulary)}
          ${this._renderScoreCard('Fluency', e.fluency)}
          ${this._renderScoreCard('Task', e.task_completion)}
        </div>

        <!-- Corrections -->
        ${this._renderCorrections(e.grammar?.corrections)}

        <!-- Good Phrases -->
        ${this._renderPhraseList('Phrases you used well', e.vocabulary?.good_phrases, '#4CAF50')}

        <!-- Suggestions -->
        ${this._renderPhraseList('Try using these phrases', e.vocabulary?.suggestions, 'var(--color-accent-primary)')}

        <!-- Summary -->
        ${e.summary ? `
          <div style="margin-top: var(--spacing-lg); padding: var(--spacing-md); background: var(--color-bg-alt); border-radius: var(--radius-sm);">
            <h5 style="margin: 0 0 var(--spacing-sm) 0; font-size: 0.9rem;">Summary</h5>
            <p style="margin: 0; color: var(--color-text-sub); font-size: 0.9rem; line-height: 1.5;">${this._escapeHtml(e.summary)}</p>
          </div>
        ` : ''}

        <!-- Focus Areas -->
        ${e.focus_areas?.length ? `
          <div style="margin-top: var(--spacing-md);">
            <h5 style="margin: 0 0 var(--spacing-sm) 0; font-size: 0.9rem;">Focus on next time</h5>
            <ul style="margin: 0; padding-left: var(--spacing-lg); color: var(--color-text-sub); font-size: 0.9rem;">
              ${e.focus_areas.map(area => `<li>${this._escapeHtml(area)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    `;
  }

  _renderScoreCard(label, data) {
    if (!data) return '';
    const score = data.score || 0;
    const scoreColor = score >= 8 ? '#4CAF50' : score >= 6 ? '#FF9800' : '#f44336';

    return `
      <div style="background: var(--color-bg-alt); padding: var(--spacing-sm); border-radius: var(--radius-sm);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <span style="font-weight: 600; font-size: 0.85rem;">${label}</span>
          <span style="font-weight: bold; color: ${scoreColor};">${score}/10</span>
        </div>
        <p style="margin: 0; font-size: 0.8rem; color: var(--color-text-sub); line-height: 1.4;">${this._escapeHtml(data.feedback || '')}</p>
      </div>
    `;
  }

  _renderCorrections(corrections) {
    if (!corrections?.length) return '';

    return `
      <div style="margin-top: var(--spacing-md);">
        <h5 style="margin: 0 0 var(--spacing-sm) 0; font-size: 0.9rem; color: #f44336;">Corrections</h5>
        <div style="background: #fff5f5; border-radius: var(--radius-sm); padding: var(--spacing-sm);">
          ${corrections.map(c => `
            <div style="font-size: 0.85rem; padding: 4px 0; border-bottom: 1px solid rgba(244,67,54,0.1);">
              ${this._escapeHtml(c)}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  _renderPhraseList(title, phrases, color) {
    if (!phrases?.length) return '';

    return `
      <div style="margin-top: var(--spacing-md);">
        <h5 style="margin: 0 0 var(--spacing-sm) 0; font-size: 0.9rem; color: ${color};">${title}</h5>
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
          ${phrases.map(p => `
            <span style="
              background: ${color}15;
              color: ${color};
              padding: 4px 10px;
              border-radius: 12px;
              font-size: 0.8rem;
              font-weight: 500;
            ">${this._escapeHtml(p)}</span>
          `).join('')}
        </div>
      </div>
    `;
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

  _attachEventListeners() {
    // Home button
    const btn = this.querySelector('#home-btn');
    if (btn) {
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
    }

    // Copy transcript button
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

      copyBtn.addEventListener('mouseover', () => {
        copyBtn.style.background = 'rgba(0,0,0,0.1)';
      });
      copyBtn.addEventListener('mouseout', () => {
        copyBtn.style.background = 'rgba(0,0,0,0.05)';
      });
    }
  }

  _escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

customElements.define('view-summary', ViewSummary);
