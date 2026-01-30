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

class ViewLogin extends HTMLElement {
  constructor() {
    super();
    this._config = null;
  }

  set config(value) {
    this._config = value;
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  render() {
    // Check for OAuth errors in URL
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    const errorMessage = urlParams.get('message');

    const errorHtml = error ? `
      <div class="login-error">
        <strong>Login failed:</strong> ${errorMessage || 'An error occurred during authentication. Please try again.'}
      </div>
    ` : '';

    this.innerHTML = `
      <div class="login-container">
        <div class="login-card">
          ${errorHtml}
          <div class="login-logo">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          </div>

          <h1>German Conversation Practice</h1>
          <p class="login-subtitle">Practice real German conversations with AI</p>

          <div class="login-info">
            <p>This tool is available exclusively to enrolled students.</p>
            <p>Please log in with your course account to continue.</p>
          </div>

          <div class="login-buttons">
            <a href="https://learn.smartergerman.com/?sg_conversation_auth=1&redirect=${encodeURIComponent(window.location.origin)}" class="login-btn login-btn-lifterlms">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
              </svg>
              Login with SmarterGerman
            </a>

            <a href="/api/teachable/authorize?redirect=${encodeURIComponent(window.location.origin)}" class="login-btn login-btn-teachable">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
                <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
              </svg>
              Login with Teachable
            </a>
          </div>

          <div class="login-footer">
            <p>Don't have an account? <a href="https://smartergerman.com/courses/" target="_blank">View our courses</a></p>
          </div>
        </div>
      </div>

      <style>
        .login-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--spacing-lg);
          background: linear-gradient(135deg, var(--color-bg) 0%, var(--color-bg-alt) 100%);
        }

        .login-card {
          background: var(--color-card-bg);
          border-radius: 16px;
          padding: var(--spacing-xxl);
          max-width: 420px;
          width: 100%;
          text-align: center;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
        }

        .login-logo {
          color: var(--color-accent-primary);
          margin-bottom: var(--spacing-lg);
        }

        .login-card h1 {
          font-size: 1.5rem;
          color: var(--color-text-main);
          margin: 0 0 var(--spacing-sm) 0;
        }

        .login-subtitle {
          color: var(--color-text-sub);
          margin: 0 0 var(--spacing-xl) 0;
          font-size: 1rem;
        }

        .login-info {
          background: var(--color-bg-alt);
          border-radius: 8px;
          padding: var(--spacing-md);
          margin-bottom: var(--spacing-xl);
        }

        .login-info p {
          margin: 0;
          font-size: 0.9rem;
          color: var(--color-text-sub);
          line-height: 1.5;
        }

        .login-info p + p {
          margin-top: var(--spacing-sm);
        }

        .login-buttons {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-md);
        }

        .login-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--spacing-sm);
          padding: var(--spacing-md) var(--spacing-lg);
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.2s ease;
          cursor: pointer;
        }

        .login-btn-lifterlms {
          background: var(--color-accent-primary);
          color: white;
        }

        .login-btn-lifterlms:hover {
          background: #c65a00;
          color: white;
          transform: translateY(-1px);
        }

        .login-btn-teachable {
          background: #1a1a2e;
          color: white;
        }

        .login-btn-teachable:hover {
          background: #3a3a5e;
          color: white;
          transform: translateY(-1px);
        }

        .login-error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #dc2626;
          padding: var(--spacing-md);
          border-radius: 8px;
          margin-bottom: var(--spacing-lg);
          font-size: 0.9rem;
        }

        .login-footer {
          margin-top: var(--spacing-xl);
          padding-top: var(--spacing-lg);
          border-top: 1px solid var(--color-bg-alt);
        }

        .login-footer p {
          margin: 0;
          font-size: 0.85rem;
          color: var(--color-text-sub);
        }

        .login-footer a {
          color: var(--color-accent-primary);
          text-decoration: none;
        }

        .login-footer a:hover {
          text-decoration: underline;
        }
      </style>
    `;
  }
}

customElements.define('view-login', ViewLogin);
