/**
 * Scenario Selection - Braun 60s Design
 * Compact list style for SmarterGerman
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
          margin-bottom: var(--spacing-md);
        }

        .page-title {
          font-size: 1.4rem;
          font-weight: 700;
          color: var(--braun-black);
          margin-bottom: var(--spacing-xs);
        }

        .page-subtitle {
          color: var(--color-text-sub);
          font-size: 0.9rem;
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
          max-width: 160px;
          padding: 8px 16px;
          border: none;
          border-radius: var(--radius-sm);
          background: transparent;
          color: var(--color-text-sub);
          font-weight: 600;
          font-size: 0.85rem;
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

        /* Scenario List - 2-3 columns */
        .scenarios-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: var(--spacing-sm);
          overflow-y: auto;
          flex: 1;
          padding-right: var(--spacing-xs);
        }

        /* Compact list item */
        .scenario-item {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          background: var(--braun-white);
          border-radius: var(--radius-sm);
          padding: 10px 14px;
          box-shadow: var(--shadow-raised);
          cursor: pointer;
          transition: all 0.15s ease;
          border-left: 3px solid transparent;
        }

        .scenario-item:hover {
          box-shadow: var(--shadow-card);
          transform: translateX(2px);
        }

        .scenario-item:active {
          box-shadow: var(--shadow-pressed);
          border-left-color: var(--braun-orange);
        }

        /* Difficulty badge */
        .difficulty-badge {
          flex-shrink: 0;
          padding: 4px 10px;
          border-radius: var(--radius-sm);
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          min-width: 54px;
          text-align: center;
        }

        .difficulty-easy { background: #C8E6C9; color: #1B5E20; }
        .difficulty-medium { background: #FFE082; color: #E65100; }
        .difficulty-hard { background: #FFAB91; color: #BF360C; }

        /* Scenario text */
        .scenario-text {
          flex: 1;
          min-width: 0;
          text-align: left;
        }

        .scenario-title {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--braun-black);
          line-height: 1.3;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .scenario-desc {
          font-size: 0.75rem;
          color: var(--color-text-sub);
          line-height: 1.3;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      </style>

      <div class="scenarios-container">
        <div class="page-header">
          <h1 class="page-title">Choose a Scenario</h1>
          <p class="page-subtitle">Select a conversation to practice</p>
        </div>

        <div class="mode-toggle">
          <button id="mode-immersive" class="mode-btn active">Immersive</button>
          <button id="mode-teacher" class="mode-btn">With Guidance</button>
        </div>

        <div class="scenarios-grid" id="scenarios-list">
          <!-- Scenarios rendered here -->
        </div>
      </div>
    `;

    this.renderScenarios();
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

  renderScenarios() {
    const scenarios = missionsData;
    const container = this.querySelector('#scenarios-list');

    scenarios.forEach(scenario => {
      const item = document.createElement('div');
      item.className = 'scenario-item';

      let difficultyClass = 'difficulty-easy';
      if (scenario.difficulty === 'Medium') difficultyClass = 'difficulty-medium';
      if (scenario.difficulty === 'Hard' || scenario.difficulty === 'Expert') difficultyClass = 'difficulty-hard';

      item.innerHTML = `
        <span class="difficulty-badge ${difficultyClass}">${scenario.difficulty}</span>
        <div class="scenario-text">
          <div class="scenario-title">${scenario.title}</div>
          <div class="scenario-desc">${scenario.desc}</div>
        </div>
      `;

      item.addEventListener('click', () => {
        const selectedMode = localStorage.getItem('immergo_mode') || 'immergo_immersive';

        this.dispatchEvent(new CustomEvent('navigate', {
          bubbles: true,
          detail: {
            view: 'chat',
            mission: scenario,
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
