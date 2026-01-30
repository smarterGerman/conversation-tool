# Comprehensive Code Review Prompt

Use this prompt with an AI coding assistant or provide to a professional developer for a thorough code review.

---

## Review Request

Please perform a comprehensive security, architecture, and code quality review of this codebase. The application is a **real-time voice conversation tool** using WebSockets for audio streaming to Google Gemini Live.

### Codebase Context

- **Backend**: Python 3.10+ / FastAPI / WebSockets / BigQuery
- **Frontend**: Vanilla JavaScript / Web Components / Web Audio API (AudioWorklets)
- **Deployment**: Google Cloud Run (containerized)
- **Auth**: JWT tokens, signed URL params, optional password protection
- **Data**: Voice audio streamed in real-time, analytics to BigQuery
- **Language**: German learning tool (fromLanguage hardcoded as English)

---

## Review Scope

### 1. Security Audit

**Authentication & Authorization:**
- Review JWT handling in `server/main.py` (`/api/auth` endpoint)
- Check for token validation vulnerabilities
- Assess session token generation and expiration
- Review signed URL parameter validation
- Check for auth bypass possibilities

**Input Validation:**
- WebSocket message handling in `server/gemini_live.py`
- REST API input sanitization
- SQL/NoSQL injection vectors (BigQuery queries in `server/simple_tracker.py`, `server/gdpr_utils.py`)
- XSS prevention in frontend components

**Secrets Management:**
- Environment variable handling
- API key exposure risks
- Credential storage (sessionStorage vs localStorage usage)

**CORS & CSP:**
- Review CORS configuration in `server/main.py`
- Frame ancestors policy
- WebSocket origin validation

**Rate Limiting:**
- Assess rate limiting implementation (`slowapi`/Redis)
- Check for bypass vectors
- Review per-user limits (`DAILY_USER_LIMIT`)

**GDPR Compliance:**
- Review auth flow in `src/components/view-chat.js`
- Audit logging in `server/simple_tracker.py`
- Data deletion utilities in `server/gdpr_utils.py`
- Privacy policy accuracy (`PRIVACY.md`)

### 2. Architecture Review

**Provider Abstraction:**
- Review `server/ai_provider.py` abstract base class
- Assess `server/gemini_live.py` implementation
- Check for proper resource cleanup
- Evaluate error handling patterns

**WebSocket Lifecycle:**
- Connection establishment and teardown
- Reconnection handling
- Message queue management
- Backpressure handling for audio streams

**Audio Pipeline:**
- `public/audio-processors/capture.worklet.js` - buffer sizing, performance
- `public/audio-processors/playback.worklet.js` - playback quality, latency
- Audio format conversions (sample rate, bit depth)
- Memory management in audio processing

**State Management:**
- Frontend state flow in `src/components/app-root.js`
- Component communication patterns
- Session state persistence

### 3. Code Quality

**Error Handling:**
- Graceful degradation patterns
- User-facing error messages
- Logging completeness (no sensitive data in logs)
- Exception propagation

**Performance:**
- Async/await patterns in Python
- Memory leaks (especially in audio worklets)
- BigQuery query efficiency
- Frontend bundle size concerns

**Maintainability:**
- Code organization and separation of concerns
- Documentation completeness
- Type hints (Python) / JSDoc (JavaScript)
- Naming conventions consistency

**Testing Gaps:**
- Identify untested critical paths
- Suggest test priorities

### 4. Operational Concerns

**Deployment:**
- Review `.github/workflows/deploy.yml`
- Environment variable handling
- Secrets exposure in CI/CD

**Monitoring & Observability:**
- Logging coverage
- Error tracking readiness
- Performance metrics

**Scalability:**
- Concurrent connection handling
- Cloud Run scaling considerations
- Redis usage patterns

---

## Files to Review (Priority Order)

### High Priority (Security-Critical)
1. `server/main.py` - Auth endpoints, CORS, middleware
2. `server/gemini_live.py` - WebSocket handling, API credentials
3. `src/lib/gemini-live/geminilive.js` - Client-side auth, WebSocket

### Medium Priority (Core Functionality)
4. `src/components/view-chat.js` - Main UI, auth flow, audio handling
5. `server/simple_tracker.py` - Analytics logging
6. `server/gdpr_utils.py` - Data subject request utilities
7. `public/audio-processors/*.worklet.js` - Audio processing

### Lower Priority (Supporting Code)
8. `src/components/app-root.js` - State management
9. `server/ai_provider.py` - Provider abstraction
10. `.github/workflows/deploy.yml` - CI/CD
11. Legal docs: `PRIVACY.md`, `TERMS.md`

---

## Expected Deliverables

1. **Security findings** - Categorized by severity (Critical/High/Medium/Low)
2. **Architecture recommendations** - Specific improvements with rationale
3. **Code quality issues** - With line references where applicable
4. **Actionable items** - Prioritized list of fixes/improvements

---

## Additional Context

- Current user base: ~1,000 active users
- Primary market: EU (GDPR compliance mandatory)
- Real-time audio latency is critical for user experience
- Application uses Google Gemini as the AI provider
