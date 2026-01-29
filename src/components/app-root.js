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
import './text-cycler.js';

class AppRoot extends HTMLElement {
    constructor() {
        super();
        this.state = {
            view: 'missions', // missions, chat, summary
            selectedMission: null,
            selectedLanguage: null,
            sessionResult: null
        };
    }

    connectedCallback() {
        // Setup static layout once
        this.innerHTML = '';

        // Simple header with logo
        const header = document.createElement('header');
        header.style.cssText = `
            display: flex;
            justify-content: center;
            align-items: center;
            padding: var(--spacing-md) var(--spacing-lg);
            width: 100%;
            background: var(--braun-light);
            border-bottom: 1px solid var(--braun-mid);
        `;

        header.innerHTML = ``;

        this.appendChild(header);

        // View Container
        this.viewContainer = document.createElement('div');
        this.viewContainer.style.height = "100%";
        this.viewContainer.style.width = "100%";
        this.appendChild(this.viewContainer);

        this.render();

        this.checkConfigStatus();

        this.addEventListener('navigate', (e) => {
            this.state.view = e.detail.view;
            if (e.detail.mission) this.state.selectedMission = e.detail.mission;
            if (e.detail.language) this.state.selectedLanguage = e.detail.language;
            if (e.detail.fromLanguage) this.state.selectedFromLanguage = e.detail.fromLanguage;
            if (e.detail.mode) this.state.selectedMode = e.detail.mode;
            if (e.detail.result) this.state.sessionResult = e.detail.result;
            this.render();
        });
    }

    async checkConfigStatus() {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();

            // Store config for use by other components
            this.appConfig = data;

            // Dynamically load ReCAPTCHA if configured
            if (data.recaptcha_site_key) {
                this.loadRecaptchaScript(data.recaptcha_site_key);
            }

            if (data.mode === 'simple') {
                this.showSimpleModeWarning(data.missing);
            }
        } catch (e) {
            console.warn("Failed to check config status:", e);
        }
    }

    loadRecaptchaScript(siteKey) {
        // Avoid loading multiple times
        if (document.getElementById('recaptcha-script') || window.grecaptcha) {
            return;
        }
        const script = document.createElement('script');
        script.id = 'recaptcha-script';
        script.src = `https://www.google.com/recaptcha/enterprise.js?render=${siteKey}`;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
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
            case 'missions':
                currentView = document.createElement('view-missions');
                break;
            case 'chat':
                currentView = document.createElement('view-chat');
                currentView.mission = this.state.selectedMission;
                currentView.language = this.state.selectedLanguage;
                currentView.fromLanguage = this.state.selectedFromLanguage;
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
    }
}

customElements.define('app-root', AppRoot);
