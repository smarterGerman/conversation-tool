# GEMINI.md - Project Context & Agent Instructions

This file provides critical context and instructions for AI coding agents (Gemini CLI, Cursor, Claude Code, etc.) working on the **Immergo** project.

## Project Overview
**Immergo** is an immersive language learning application that leverages the **Google Gemini Live API** to simulate real-world roleplay scenarios. It features low-latency, full-duplex audio communication, allowing users to practice speaking in various languages with an AI persona.

## Tech Stack
- **Backend**: Python 3.10+, FastAPI, `google-genai` SDK, `websockets`, `redis` (rate limiting), `google-cloud-bigquery` (metrics).
- **Frontend**: Vanilla JavaScript (ES Modules), Vite, Web Components (Custom Elements), Web Audio API (AudioWorklets).
- **Communication**: WebSockets for real-time PCM audio streaming and JSON control messages.

## Core Architecture

### Backend (`/server`)
- `main.py`: Entry point for the FastAPI application. Handles static file serving, REST API endpoints (`/api/*`), and the WebSocket endpoint (`/ws`).
- `gemini_live.py`: Manages the lifecycle of the Gemini Live session. Connects to the Google GenAI backend and proxies messages between the client and Gemini.
- `simple_tracker.py`: Handles session and event tracking (BigQuery).
- `config_utils.py`: Configuration and environment variable management.

### Frontend (`/src`)
- `main.js`: Application initialization.
- `components/app-root.js`: Main state management and view orchestration (Splash -> Missions -> Chat -> Summary).
- `lib/gemini-live/geminilive.js`: Client-side implementation of the Gemini Live protocol. Handles WebSocket lifecycle, setup messages, and audio/text message routing.
- `components/view-chat.js`: The primary interaction view. Manages the audio visualizer, transcriptions, and session state.
- `public/audio-processors/`: Contains `capture.worklet.js` and `playback.worklet.js` for low-level audio handling via Web Audio API.

## Key Concepts & Workflows

### Missions
Missions are defined in `src/data/missions.json`. Each mission includes:
- `id`: Unique identifier.
- `title`: Display name.
- `persona`: The role the AI should adopt.
- `situation`: The context of the roleplay.
- `objectives`: Specific goals for the user to achieve.

### Interaction Modes
- **Teacher Mode**: AI provides explanations and can speak the user's native language.
- **Immersive Mode**: AI strictly speaks the target language and challenges the user to stay in character.

### Audio Pipeline
1. **Capture**: `capture.worklet.js` collects PCM audio from the user's microphone.
2. **Streaming**: `view-chat.js` sends binary PCM data over the WebSocket via `GeminiLiveAPI`.
3. **Processing**: `gemini_live.py` (backend) receives and forwards audio to Gemini.
4. **Playback**: Model responses (PCM audio) are received via WebSocket and played back using `playback.worklet.js`.

## Development Guidelines

### Coding Style
- **Frontend**: Use Vanilla JS with Web Components. Avoid adding external UI frameworks (React, Vue, etc.) unless explicitly requested. Use standard CSS variables defined in `style.css`.
- **Backend**: Use `async`/`await` for all I/O bound operations. Follow FastAPI best practices.
- **Naming**: Use camelCase for JavaScript and snake_case for Python.
- **Mobile Safety**: When styling absolute/fixed headers or containers, always account for device notches using `env(safe-area-inset-*)` (e.g., `padding-top: calc(var(--spacing-md) + env(safe-area-inset-top))`).
- **Commits**: Use **Conventional Commits** (e.g., `feat:`, `fix:`, `docs:`) for all repository contributions.

### UI Patterns
- **HUD & Pills**: For system labels or status indicators, use low-opacity backgrounds (`rgba(0,0,0,0.04)`), full rounding (`var(--radius-full)`), and bold, small uppercase text (`font-size: 0.75rem`, `letter-spacing: 0.05em`).
- **Glassmorphism**: Use the project's glass panel style for overlays: `backdrop-filter: blur(20px); border: var(--glass-border);`.

### Gemini Live Prompting
Standardize the structure of `systemInstruction` in `view-chat.js`:
1.  **ROLEPLAY INSTRUCTION**: Define the AI's persona, the user's role, and the scenario.
2.  **INTERACTION GUIDELINES**: Define behavior constraints (e.g., teaching protocols, proactivity, or strictness).
3.  **MISSION COMPLETION**: Explicitly define the trigger for the `complete_mission` tool, including scoring criteria and feedback requirements.


### Environment Setup
- Backend runs on port `8000`.
- Frontend (Vite) runs on port `5173`.
- Use `./dev.sh` to start both with hot-reloading enabled.

### Testing & Verification
- Verify backend changes with `go test ./...` (if applicable) or manual integration tests.
- Check browser console for WebSocket errors or audio processing warnings.
- Ensure `DEV_MODE=True` in `.env` for local development to bypass production-only features like reCAPTCHA.

## AI Provider Configuration

### Supported Providers

The application supports multiple AI providers via the abstraction layer in `server/ai_provider.py`:

| Provider | Env Var Value | Data Location | GDPR Status |
|----------|---------------|---------------|-------------|
| **Google Gemini** | `gemini` (default) | US/EU | Covered by EU-US DPF |
| **Alibaba Qwen** | `qwen` | China | Requires explicit consent |

### Cost Analysis (January 2026)

Based on 5-minute average conversation (3 min user + 2 min AI @ 25 tokens/sec):

| Provider | Cost per Conversation | 10k Users (10 convos/mo) | 100k Users |
|----------|----------------------|--------------------------|------------|
| **Google Gemini** | ~$0.13 | ~$13,000/mo | ~$130,000/mo |
| **Alibaba Qwen** | ~$0.07 | ~$7,000/mo | ~$70,000/mo |
| **OpenAI Realtime** | ~$1.50 | ~$150,000/mo | N/A |

**Per-user cost:** ~€0.70-1.50/month (Qwen/Gemini) at 10 conversations/month.

**Self-hosting decision:** At <100k users, API costs (~€1.50/user/month max) don't justify the complexity of self-hosting Qwen3-Omni (requires 2-4× A100 GPUs, DevOps overhead).

### Switching Providers

```bash
# In GitHub Actions secrets/variables:
AI_PROVIDER=qwen                           # or "gemini" (default)
QWEN_API_KEY=sk-xxxx                       # DashScope API key
QWEN_MODEL=qwen3-omni-flash-realtime       # Model identifier
QWEN_REGION=intl                           # "intl" (Singapore) or "cn" (Beijing)
```

### GDPR Compliance

When using Qwen (data processed in China):
- Frontend shows consent dialog before first session
- Consent is stored client-side (localStorage) AND server-side (BigQuery)
- Server logs: timestamp, user_id, provider, IP address
- Retention: 3 years minimum (GDPR Article 7 requirement)

Files:
- `server/ai_provider.py`: Abstract base class
- `server/gemini_live.py`: Google Gemini implementation
- `server/qwen_live.py`: Alibaba Qwen implementation
- `PRIVACY.md`: Privacy policy with both providers
- `TERMS.md`: Terms of service

## Code Review

For comprehensive security, architecture, and code quality reviews, use the prompt in `REVIEW_PROMPT.md`. This covers:

- **Security audit**: Auth, input validation, secrets, CORS, rate limiting, GDPR
- **Architecture review**: Provider abstraction, WebSocket lifecycle, audio pipeline
- **Code quality**: Error handling, performance, maintainability
- **Operational concerns**: Deployment, monitoring, scalability

### Running a Review

```bash
# With Claude Code CLI
cat REVIEW_PROMPT.md | claude

# Or copy the prompt content to any AI assistant capable of code review
```

### GDPR Data Utilities

Handle data subject requests (Article 15, 17, 20):

```bash
# Export user data (Article 15 & 20)
python -m server.gdpr_utils export user@example.com

# Dry run deletion (preview what would be deleted)
python -m server.gdpr_utils delete user@example.com

# Actually delete/anonymize (Article 17)
python -m server.gdpr_utils delete user@example.com --confirm

# Get full deletion instructions
python -m server.gdpr_utils instructions user@example.com
```

## Common Tasks for Agents
- **Adding a Mission**: Update `src/data/missions.json` with a new scenario definition.
- **UI Tweaks**: Modify components in `src/components/` and check `src/style.css` for theme variables.
- **Live API Logic**: Look into `server/gemini_live.py` for backend handling and `src/lib/gemini-live/geminilive.js` for client-side protocol adjustments.
- **Audio Improvements**: Investigate `public/audio-processors/` and `src/components/audio-visualizer.js`.
