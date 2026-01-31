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

import './view-missions.js';
import './view-chat.js';
import './view-summary.js';
import './view-login.js';
import './text-cycler.js';

// Allowed parent origins for iframe communication (must match ALLOWED_FRAME_ANCESTORS)
const ALLOWED_PARENT_ORIGINS = [
    'https://learn.smartergerman.com',
    'https://courses.smartergerman.com'
];

class AppRoot extends HTMLElement {
    constructor() {
        super();
        this.state = {
            view: 'missions', // login, missions, chat, summary
            selectedMission: null,
            selectedLanguage: null,
            sessionResult: null,
            isAuthenticated: false
        };
    }

    connectedCallback() {
        // Setup static layout once
        this.innerHTML = '';


        // View Container
        this.viewContainer = document.createElement('div');
        this.viewContainer.style.height = "100%";
        this.viewContainer.style.width = "100%";
        this.appendChild(this.viewContainer);

        // Check authentication before rendering
        this.checkAuthentication();

        this.checkConfigStatus();

        this.addEventListener('navigate', (e) => {
            this.state.view = e.detail.view;
            if (e.detail.mission) this.state.selectedMission = e.detail.mission;
            if (e.detail.language) this.state.selectedLanguage = e.detail.language;
            if (e.detail.mode) this.state.selectedMode = e.detail.mode;
            if (e.detail.result) this.state.sessionResult = e.detail.result;
            this.render();
        });
    }

    async checkAuthentication() {
        const urlParams = new URLSearchParams(window.location.search);

        // Check for LifterLMS auth_token (from WordPress redirect)
        const authToken = urlParams.get("auth_token");
        if (authToken) {
            // Clean URL immediately
            window.history.replaceState({}, document.title, window.location.pathname);

            try {
                const response = await fetch('https://learn.smartergerman.com/wp-json/sg-conversation/v1/verify-token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: authToken })
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.success) {
                        // Store user info in session
                        sessionStorage.setItem('sg_conversation_user', JSON.stringify({
                            user_id: data.user_id,
                            email: data.email,
                            display_name: data.display_name,
                            tier: data.tier
                        }));
                        this.state.isAuthenticated = true;
                        this.state.userTier = data.tier;
                        this.render();
                        return;
                    }
                }
            } catch (e) {
                console.error('LifterLMS auth verification failed:', e);
            }
        }

        // Check for stored LifterLMS session
        const storedUser = sessionStorage.getItem('sg_conversation_user');
        if (storedUser) {
            try {
                const userData = JSON.parse(storedUser);
                this.state.isAuthenticated = true;
                this.state.userTier = userData.tier;
                this.render();
                return;
            } catch (e) {
                sessionStorage.removeItem('sg_conversation_user');
            }
        }

        // Check for JWT token
        const jwtToken = urlParams.get("jwt") || urlParams.get("token");

        // Check for signed URL params
        const hasSignedUrl = urlParams.get("user") && urlParams.get("sig");

        // User is authenticated if they have JWT or signed URL params
        this.state.isAuthenticated = !!(jwtToken || hasSignedUrl);

        // If not authenticated, show login view
        if (!this.state.isAuthenticated) {
            this.state.view = 'login';
        }

        this.render();
    }

    async checkConfigStatus() {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();

            // Store config for use by other components
            this.appConfig = data;

            if (data.mode === 'simple') {
                this.showSimpleModeWarning(data.missing);
            }
        } catch (e) {
            console.warn("Failed to check config status:", e);
        }
    }

    showSimpleModeWarning(missing) {
        const warning = document.createElement('div');
        warning.style.cssText = `
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: var(--braun-light);
            color: var(--braun-dark);
            padding: 12px 20px;
            text-align: center;
            font-size: 0.85rem;
            z-index: 9999;
            border-top: 2px solid var(--braun-orange);
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 8px;
        `;

        const missingText = missing.join(' & ');
        warning.innerHTML = `
            <span><b>Dev Mode:</b> Security features (${missingText}) not configured.</span>
        `;

        this.appendChild(warning);
    }

    render() {
        if (!this.viewContainer) return;

        this.viewContainer.innerHTML = '';
        let currentView;

        switch (this.state.view) {
            case 'login':
                currentView = document.createElement('view-login');
                currentView.config = this.appConfig;
                break;
            case 'missions':
                currentView = document.createElement('view-missions');
                break;
            case 'chat':
                currentView = document.createElement('view-chat');
                currentView.mission = this.state.selectedMission;
                currentView.language = this.state.selectedLanguage;
                currentView.mode = this.state.selectedMode;
                break;
            case 'summary':
                currentView = document.createElement('view-summary');
                currentView.result = this.state.sessionResult;
                break;
            default:
                currentView = document.createElement('view-missions');
        }

        currentView.classList.add('fade-in');
        this.viewContainer.appendChild(currentView);

        // Broadcast height to parent for iframe resizing
        this.broadcastHeight();
    }

    broadcastHeight() {
        // Only broadcast if we're in an iframe
        if (window.parent === window) return;

        // Helper to send to allowed origins only (security fix: no wildcard)
        const sendHeightToParent = (height) => {
            // Try to determine parent origin from referrer
            let targetOrigin = null;
            try {
                if (document.referrer) {
                    const referrerUrl = new URL(document.referrer);
                    const referrerOrigin = referrerUrl.origin;
                    if (ALLOWED_PARENT_ORIGINS.includes(referrerOrigin)) {
                        targetOrigin = referrerOrigin;
                    }
                }
            } catch (e) {
                // Referrer parsing failed, continue with fallback
            }

            // If we couldn't determine origin, send to all allowed origins
            // This is safe because only the actual parent will receive the message
            const origins = targetOrigin ? [targetOrigin] : ALLOWED_PARENT_ORIGINS;
            origins.forEach(origin => {
                window.parent.postMessage({ type: 'sg-resize', height }, origin);
            });
        };

        // Use requestAnimationFrame to ensure DOM is rendered
        requestAnimationFrame(() => {
            const height = document.body.scrollHeight;
            sendHeightToParent(height);
        });

        // Also set up a MutationObserver to catch dynamic content changes
        if (!this._heightObserver) {
            this._heightObserver = new MutationObserver(() => {
                if (window.parent !== window) {
                    const height = document.body.scrollHeight;
                    sendHeightToParent(height);
                }
            });
            this._heightObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true
            });
        }
    }
}

customElements.define('app-root', AppRoot);
