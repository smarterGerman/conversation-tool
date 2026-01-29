/**
 * Scenario Selection - Braun 60s Design
 * CEFR Level Accordions (A1-C1)
 */

import missionsData from '../data/missions.json';

class ViewMissions extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          height: calc(100vh - 60px);
          overflow: hidden;
        }

        .scenarios-container {
          max-width: 900px;
          margin: 0 auto;
          padding: var(--spacing-md) var(--spacing-lg);
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .page-header {
          text-align: center;
          margin-bottom: var(--spacing-sm);
        }

        .page-title {
          font-size: 1.3rem;
          font-weight: 700;
          color: var(--braun-black);
          margin-bottom: 2px;
        }


        /* Mode Toggle */
        .mode-toggle {
          display: flex;
          gap: var(--spacing-xs);
          justify-content: center;
          margin-bottom: var(--spacing-md);
          background: var(--braun-light);
          padding: var(--spacing-xs);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-pressed);
        }

        .mode-btn {
          flex: 1;
          max-width: 140px;
          padding: 6px 14px;
          border: none;
          border-radius: var(--radius-sm);
          background: transparent;
          color: var(--color-text-sub);
          font-weight: 600;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .mode-btn:hover {
          color: var(--braun-dark);
        }

        .mode-btn.active {
          background: var(--braun-white);
          color: var(--braun-black);
          box-shadow: var(--shadow-raised);
        }

        /* Accordion container */
        .levels-container {
          flex: 1;
          overflow-y: auto;
          padding-right: var(--spacing-xs);
        }

        /* Level Accordion */
        .level-accordion {
          margin-bottom: var(--spacing-sm);
          border-radius: var(--radius-md);
          overflow: hidden;
          background: var(--braun-white);
          box-shadow: var(--shadow-raised);
        }

        .level-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          cursor: pointer;
          border: none;
          background: transparent;
          width: 100%;
          text-align: left;
          transition: background 0.15s ease;
        }

        .level-header:hover {
          background: var(--braun-light);
        }

        .level-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .level-badge {
          padding: 4px 12px;
          border-radius: var(--radius-sm);
          font-size: 0.85rem;
          font-weight: 700;
          min-width: 36px;
          text-align: center;
        }

        .level-badge {
          background: var(--braun-light);
          color: var(--braun-dark);
          box-shadow: var(--shadow-pressed);
        }

        .level-title {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--braun-black);
        }

        .level-count {
          font-size: 0.75rem;
          color: var(--color-text-sub);
        }

        .chevron {
          transition: transform 0.2s ease;
          color: var(--color-text-sub);
        }

        .level-accordion.open .chevron {
          transform: rotate(180deg);
        }

        .level-content {
          display: none;
          padding: 0 var(--spacing-sm) var(--spacing-sm);
        }

        .level-accordion.open .level-content {
          display: block;
        }

        /* Scenario grid inside accordion */
        .scenarios-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: var(--spacing-xs);
        }

        /* Compact scenario item */
        .scenario-item {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          background: var(--braun-light);
          border-radius: var(--radius-sm);
          padding: 8px 12px;
          cursor: pointer;
          transition: all 0.15s ease;
          border-left: 3px solid transparent;
        }

        .scenario-item:hover {
          background: var(--braun-mid);
          transform: translateX(2px);
        }

        .scenario-item:active {
          border-left-color: var(--braun-orange);
        }

        .scenario-item.exam {
          border-left-color: var(--braun-orange);
          background: rgba(240, 78, 35, 0.08);
        }

        /* Scenario text */
        .scenario-text {
          flex: 1;
          min-width: 0;
          text-align: left;
        }

        .scenario-title {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--braun-black);
          line-height: 1.3;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .scenario-desc {
          font-size: 0.7rem;
          color: var(--color-text-sub);
          line-height: 1.3;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      </style>

      <div class="scenarios-container">
        <div class="page-header">
          <h1 class="page-title">Select your level and topic</h1>
        </div>

        <div class="mode-toggle">
          <button id="mode-immersive" class="mode-btn active">Immersive</button>
          <button id="mode-teacher" class="mode-btn">With Guidance</button>
        </div>

        <div class="levels-container" id="levels-container">
          <!-- Levels rendered here -->
        </div>
      </div>
    `;

    this.renderLevels();
    this.setupModeToggle();
  }

  setupModeToggle() {
    const modeImmersive = this.querySelector('#mode-immersive');
    const modeTeacher = this.querySelector('#mode-teacher');

    let currentMode = localStorage.getItem('immergo_mode') || 'immergo_immersive';

    const updateUI = () => {
      modeImmersive.classList.toggle('active', currentMode === 'immergo_immersive');
      modeTeacher.classList.toggle('active', currentMode === 'immergo_teacher');
    };

    modeImmersive.addEventListener('click', () => {
      currentMode = 'immergo_immersive';
      localStorage.setItem('immergo_mode', currentMode);
      updateUI();
    });

    modeTeacher.addEventListener('click', () => {
      currentMode = 'immergo_teacher';
      localStorage.setItem('immergo_mode', currentMode);
      updateUI();
    });

    updateUI();
  }

  renderLevels() {
    const container = this.querySelector('#levels-container');
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1'];
    const levelDescriptions = {
      'A1': 'Beginner',
      'A2': 'Elementary',
      'B1': 'Intermediate',
      'B2': 'Upper Intermediate',
      'C1': 'Advanced'
    };

    levels.forEach((level, index) => {
      const scenarios = missionsData[level] || [];
      const accordion = document.createElement('div');
      accordion.className = 'level-accordion' + (index === 0 ? ' open' : '');

      accordion.innerHTML = `
        <button class="level-header">
          <div class="level-info">
            <span class="level-badge level-${level}">${level}</span>
            <div>
              <div class="level-title">${levelDescriptions[level]}</div>
              <div class="level-count">${scenarios.length} scenarios</div>
            </div>
          </div>
          <svg class="chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <div class="level-content">
          <div class="scenarios-grid" data-level="${level}"></div>
        </div>
      `;

      // Toggle accordion
      accordion.querySelector('.level-header').addEventListener('click', () => {
        accordion.classList.toggle('open');
      });

      container.appendChild(accordion);

      // Render scenarios for this level
      const grid = accordion.querySelector('.scenarios-grid');
      this.renderScenarios(grid, scenarios, level);
    });
  }

  renderScenarios(container, scenarios, level) {
    scenarios.forEach(scenario => {
      const item = document.createElement('div');
      const isExam = scenario.title.toLowerCase().includes('exam');
      item.className = 'scenario-item' + (isExam ? ' exam' : '');

      item.innerHTML = `
        <div class="scenario-text">
          <div class="scenario-title">${scenario.title}</div>
          <div class="scenario-desc">${scenario.desc}</div>
        </div>
        <svg class="scenario-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
      `;

      item.addEventListener('click', () => {
        const selectedMode = localStorage.getItem('immergo_mode') || 'immergo_immersive';

        this.dispatchEvent(new CustomEvent('navigate', {
          bubbles: true,
          detail: {
            view: 'chat',
            mission: { ...scenario, level: level },
            language: 'German',
            fromLanguage: 'English',
            mode: selectedMode
          }
        }));
      });

      container.appendChild(item);
    });
  }
}

customElements.define('view-missions', ViewMissions);
