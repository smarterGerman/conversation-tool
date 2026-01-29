/**
 * Splash Screen - Braun 60s Design
 * "Good design is as little design as possible" - Dieter Rams
 */

class ViewSplash extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          min-height: calc(100vh - 60px);
        }

        .splash-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: calc(100vh - 120px);
          padding: var(--spacing-xl);
          text-align: center;
        }

        .splash-title {
          font-size: clamp(1.8rem, 5vw, 2.5rem);
          font-weight: 700;
          color: var(--braun-black);
          letter-spacing: -1px;
          margin-bottom: var(--spacing-md);
        }

        .splash-subtitle {
          font-size: 1.1rem;
          color: var(--color-text-sub);
          margin-bottom: var(--spacing-xxl);
          max-width: 400px;
          line-height: 1.6;
        }

        .start-btn {
          background: var(--braun-orange);
          color: white;
          border: none;
          border-radius: 50%;
          width: 120px;
          height: 120px;
          font-weight: 700;
          font-size: 1rem;
          text-transform: uppercase;
          cursor: pointer;
          box-shadow: 0 8px 30px var(--braun-orange-glow);
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          letter-spacing: 0.5px;
        }

        .start-btn:hover {
          background: var(--braun-orange-dark);
          transform: translateY(-4px);
          box-shadow: 0 12px 40px var(--braun-orange-glow);
        }

        .start-btn:active {
          transform: translateY(-2px);
        }

        .powered-by {
          margin-top: var(--spacing-xxl);
          font-size: 0.8rem;
          color: var(--color-text-sub);
          opacity: 0.7;
        }
      </style>

      <div class="splash-container">
        <h1 class="splash-title">Conversation Practice</h1>
        <p class="splash-subtitle">
          Practice real German conversations with AI.
          Speak naturally and improve your fluency.
        </p>

        <button id="start-btn" class="start-btn">
          Start
        </button>

        <p class="powered-by">
          Powered by Gemini Live API
        </p>
      </div>
    `;

    this.querySelector('#start-btn').addEventListener('click', () => {
      this.style.opacity = '0';
      this.style.transition = 'opacity 0.3s ease';

      setTimeout(() => {
        this.dispatchEvent(new CustomEvent('navigate', {
          bubbles: true,
          detail: { view: 'missions' }
        }));
      }, 300);
    });
  }
}

customElements.define('view-splash', ViewSplash);
