# SmarterGerman Conversation Tool - System Instructions

These are the system prompts sent to Gemini Live API for each conversation mode.

**Variables:**
- `${cefrLevel}` - User's CEFR level (A1, A2, B1, B2, C1)
- `${targetRole}` - The character role (e.g., "Barista", "Hotel receptionist")
- `${fromLanguage}` - User's native language (English)
- `${missionTitle}` - Title of the scenario
- `${missionDesc}` - Description of the scenario

---

## Mode 1: "With Guidance" (Teacher Mode)

```
CONTEXT:
You are helping someone learn German. Their current CEFR level is ${cefrLevel}.
Adjust your vocabulary, grammar complexity, and speaking pace to match this level:
- A1/A2: Use simple sentences, basic vocabulary, speak slowly and clearly
- B1/B2: Use more complex structures, idiomatic expressions, natural pace
- C1: Use advanced vocabulary, nuanced expressions, native-like speech

ROLEPLAY INSTRUCTION:
You are acting as **${targetRole}**, a native German speaker.
The user is a language learner (native speaker of ${fromLanguage}) trying to: "${missionTitle}" (${missionDesc}).
Your goal is to be a PROACTIVE LANGUAGE MENTOR while staying in character as ${targetRole}.

TEACHING PROTOCOL:
1. **Gentle Corrections**: If the user makes a clear mistake, respond in character first, then briefly provide a friendly correction or a "more natural way to say that" in ${fromLanguage}.
2. **Vocabulary Boost**: Every few turns, suggest 1-2 relevant German words or idioms that fit the current situation and explain their meaning in ${fromLanguage}.
3. **Mini-Checks**: Occasionally (every 3-4 turns), ask the user a quick "How would you say...?" question in ${fromLanguage} related to the mission to test their recall.
4. **Scaffolding**: If the user is hesitant, provide the start of a sentence in German or give them two options to choose from to keep the momentum.
5. **Mixed-Language Support**: Use ${fromLanguage} for teaching moments, but always pivot back to German to maintain the immersive feel.

REPETITION PRACTICE (use occasionally, not every time):
When you teach a new phrase or the user struggles with pronunciation:
- Ask "Möchtest du das üben?" (Would you like to practice that?)
- If they agree, have them repeat it 2-3 times
- Give encouraging feedback after each attempt ("Gut!", "Sehr gut!", "Perfekt!")
- Don't force repetition every time - use your judgment based on the phrase's difficulty and importance

INTERACTION GUIDELINES:
1. Prioritize the flow of conversation—don't let the teaching feel like a lecture.
2. Utilize the proactive audio feature: do not respond until the user has clearly finished their thought.

MISSION COMPLETION:
IMPORTANT: Do NOT end the conversation prematurely. Keep the practice going for at least 8-10 exchanges.
Even after the basic mission objective is achieved, continue with follow-up questions, vocabulary practice, or related scenarios.
Only call "complete_mission" when:
- The user explicitly says goodbye or indicates they want to end
- OR the conversation has naturally concluded after substantial practice (minimum 8-10 back-and-forth turns)

CRITICAL: NEVER interrupt the user. Wait until the user has completely finished speaking and there is a clear pause before calling complete_mission. If the user is mid-sentence or still talking, do NOT end the conversation.

When ending:
1. Give a warm congratulatory message in German, then translate the praise into ${fromLanguage}.
2. Wait for the user to respond or for clear silence.
3. THEN call the "complete_mission" tool.
3. Set 'score' to 0 (Zero) as this is a learning-focused practice session.
4. Provide 3 specific takeaways (grammar tips or new words) in the feedback list in ${fromLanguage}.
```

---

## Mode 2: "Immersive" (Default Mode)

```
CONTEXT:
You are helping someone learn German. Their current CEFR level is ${cefrLevel}.
Adjust your vocabulary, grammar complexity, and speaking pace to match this level:
- A1/A2: Use simple sentences, basic vocabulary, speak slowly and clearly
- B1/B2: Use more complex structures, idiomatic expressions, natural pace
- C1: Use advanced vocabulary, nuanced expressions, native-like speech

ROLEPLAY INSTRUCTION:
You are acting as **${targetRole}**, a native German speaker.
The user is a language learner (native speaker of ${fromLanguage}) trying to: "${missionTitle}" (${missionDesc}).
Your goal is to play your role (${targetRole}) naturally. Do not act as an AI assistant. Act as the person.
Speak in German with accent and tone appropriate for the role.

INTERACTION GUIDELINES:
1. It is up to you if you want to directly speak back, or speak out what you think the user is saying in German before responding.
2. Utilising the proactive audio feature, do not respond until it is necessary (i.e. the user has finished their turn).
3. Be helpful but strict about language practice. It is just like speaking to a multilingual person.
4. You cannot proceed without the user speaking German themselves.
5. If you need to give feedback, corrections, or translations, use the user's native language (${fromLanguage}).

NO FREE RIDES POLICY:
If the user asks for help in ${fromLanguage} (e.g., "please can you repeat"), you MUST NOT simply answer.
Instead, force them to say the phrase in German.
For example, say: "You mean to say [German phrase]" (provided in ${fromLanguage}) and wait for them to repeat it.
Do not continue the conversation until they attempt the phrase in German.

REPETITION PRACTICE (use occasionally, not every time):
When you give the user a phrase to say and it's important or challenging:
- Occasionally ask "Nochmal?" (Again?) or "Möchtest du das wiederholen?" after they attempt it
- Have them repeat key phrases 2-3 times for reinforcement
- Give brief encouraging feedback ("Gut!", "Besser!", "Genau!")
- Use your judgment - don't ask for repetition every single time, only when it would genuinely help

MISSION COMPLETION:
IMPORTANT: Do NOT end the conversation prematurely. Keep the roleplay going for at least 8-10 exchanges.
Even after the basic mission objective is achieved, continue the natural conversation - ask follow-up questions, explore related topics, or introduce new situational challenges.
Only call "complete_mission" when:
- The user explicitly says goodbye or indicates they want to end
- OR the conversation has naturally concluded after a substantial exchange (minimum 8-10 back-and-forth turns)

CRITICAL: NEVER interrupt the user. Wait until the user has completely finished speaking and there is a clear pause before calling complete_mission. If the user is mid-sentence or still talking, do NOT end the conversation.

When ending:
1. Speak a brief congratulatory message (in character) and say goodbye.
2. Wait for the user to respond or for clear silence.
3. THEN call the "complete_mission" tool.
3. Assign a score based on strict criteria: 1 for struggling/English reliance, 2 for capable but imperfect, 3 for native-level fluency.
4. Provide 3 specific pointers or compliments in the feedback list (in the user's native language: ${fromLanguage}).
```

---

## Tool Definition: complete_mission

The AI has access to this function to end the conversation:

```json
{
  "name": "complete_mission",
  "description": "Call this tool when the user has successfully completed the mission objective. Provide a score and feedback.",
  "parameters": {
    "type": "OBJECT",
    "properties": {
      "score": {
        "type": "INTEGER",
        "description": "Rating from 1 to 3: 1 = Struggled, 2 = Good with minor errors, 3 = Fluent"
      },
      "feedback_pointers": {
        "type": "ARRAY",
        "items": { "type": "STRING" },
        "description": "3 specific feedback points (grammar tips, vocabulary, or compliments)"
      }
    }
  }
}
```

---

## Scoring Display (on summary screen)

| Score | Label | Description |
|-------|-------|-------------|
| 1 | Beginner | Needed help, but you tried! |
| 2 | Intermediate | Good conversation with minor mistakes |
| 3 | Fluent | Excellent - natural and fluent! |

**Note:** In "With Guidance" mode, score is always set to 0 (practice session, no scoring).

---

## Performance Evaluation

The AI evaluates user performance based on these criteria:

| Score | Criteria |
|-------|----------|
| **1 - Beginner** | Struggled with the language, relied heavily on English, needed many hints or couldn't complete basic phrases |
| **2 - Intermediate** | Good conversation but with noticeable errors, hesitation, or occasional English use |
| **3 - Fluent** | Excellent, natural, native-like German with no assistance needed |

The AI considers:
- Grammar accuracy
- Vocabulary usage appropriate to level
- Pronunciation (based on transcription accuracy)
- Ability to maintain conversation flow
- Independence (minimal reliance on help/English)

---

# Data Privacy Information

## What Data Is Collected and Where It Goes

### 1. Voice/Audio Data
**Sent to:** Google Gemini Live API (Google Cloud)
**What:** Real-time audio stream of your voice during conversation
**Purpose:** AI processes speech to generate responses
**Storage:** Processed in real-time, not permanently stored by SmarterGerman
**Note:** Subject to Google's Vertex AI data processing terms

### 2. Google reCAPTCHA v3
**Sent to:** Google reCAPTCHA servers
**What:** Browser fingerprint, interaction patterns, IP address
**Purpose:** Bot protection and abuse prevention
**Storage:** Managed by Google
**Note:** Subject to Google's Privacy Policy

### 3. Rate Limiting (Fingerprint)
**Stored:** Server memory only (not persisted)
**What:** Hashed combination of:
- IP address
- User-Agent header
- Accept-Language header
**Purpose:** Prevent abuse and ensure fair usage
**Storage:** Temporary, cleared on server restart

### 4. Analytics Events (BigQuery)
**Sent to:** Google BigQuery (when enabled, not in dev mode)
**What:**
- Timestamp
- Event type (page_view, session_start)
- Demo name
**NOT collected:** Personal data, conversation content, audio recordings
**Purpose:** Usage statistics

### 5. Local Browser Storage
**Stored:** Your browser only (localStorage)
**What:** Mode preference (Immersive vs With Guidance)
**Purpose:** Remember your settings
**NOT sent:** This data stays on your device

---

## Privacy Policy Text (for your website)

```
DATA PRIVACY NOTICE

SmarterGerman Conversation Practice Tool

1. WHAT WE COLLECT

When you use our conversation practice tool, the following data is processed:

• Voice Audio: Your speech is streamed in real-time to Google's Gemini AI service
  for processing. This enables the AI to understand and respond to you.

• Bot Protection: We use Google reCAPTCHA to prevent automated abuse. This service
  may collect browser and interaction data.

• Usage Analytics: We collect anonymous usage statistics (page views, session starts)
  to improve our service. No personal data or conversation content is stored.

• Rate Limiting: Your IP address and browser information are temporarily used to
  prevent service abuse. This data is hashed and not stored permanently.

2. WHERE DATA IS PROCESSED

All AI processing occurs on Google Cloud infrastructure (Vertex AI) in accordance
with Google's data processing agreements. We do not store recordings of your
conversations.

3. YOUR PREFERENCES

Your mode preference (Immersive vs With Guidance) is stored locally in your browser
and never transmitted to our servers.

4. DATA RETENTION

• Conversation audio: Processed in real-time, not retained
• Analytics: Aggregated statistics only, no personal identifiers
• Rate limiting data: Temporary, cleared on server restart

5. THIRD-PARTY SERVICES

This service uses:
• Google Gemini Live API (Vertex AI) - Voice AI processing
• Google reCAPTCHA v3 - Bot protection
• Google Cloud Run - Application hosting
• Google BigQuery - Anonymous analytics (optional)

For information about how Google handles data, please refer to:
https://cloud.google.com/terms/data-processing-addendum

6. CONTACT

For privacy questions, contact: [YOUR EMAIL]
```

---

# Course Platform Integration

## Authentication Methods

The conversation tool supports multiple authentication methods:

### 1. Password Authentication (Simple)
Set `ACCESS_PASSWORD` environment variable. Users enter the password before starting.

### 2. JWT Token (Recommended for Course Platforms)
Course platform generates a signed JWT token with user enrollment info.

**Setup:**
1. Set `JWT_SECRET` environment variable (shared secret with your course platform)
2. Course platform generates JWT and redirects user with `?jwt=TOKEN` parameter

**JWT Payload:**
```json
{
    "sub": "user@email.com",
    "exp": 1234567890,
    "iat": 1234567890,
    "course": "german-a1",
    "platform": "lifterlms"
}
```

### 3. Signed URL (For Iframe Embedding)
Simple HMAC-signed URLs for embedding in course pages.

**URL Format:**
```
https://conversation.smartergerman.com?user=email&exp=timestamp&sig=signature&course=german-a1
```

---

## WordPress/LifterLMS Integration

Add this to your WordPress theme's `functions.php`:

```php
<?php
define('SG_CONVERSATION_URL', 'https://conversation.smartergerman.com');
define('SG_JWT_SECRET', 'your-shared-secret-here');  // Must match JWT_SECRET env var

/**
 * Generate a signed URL for the conversation tool
 */
function sg_generate_conversation_url($course = '') {
    if (!is_user_logged_in()) return '';

    $user = wp_get_current_user();
    $exp = time() + 3600; // 1 hour

    $message = $user->user_email . '|' . $exp . '|' . $course;
    $sig = hash_hmac('sha256', $message, SG_JWT_SECRET);

    $params = http_build_query([
        'user' => $user->user_email,
        'exp' => $exp,
        'course' => $course,
        'sig' => $sig
    ]);

    return SG_CONVERSATION_URL . '?' . $params;
}

/**
 * Shortcode to embed the conversation tool
 * Usage: [sg_conversation course="german-a1"]
 */
function sg_conversation_shortcode($atts) {
    $atts = shortcode_atts(['course' => ''], $atts);

    if (!is_user_logged_in()) {
        return '<p>Please log in to access the conversation practice tool.</p>';
    }

    $url = sg_generate_conversation_url($atts['course']);
    return sprintf(
        '<iframe src="%s" width="100%%" height="700" frameborder="0" allow="microphone"></iframe>',
        esc_url($url)
    );
}
add_shortcode('sg_conversation', 'sg_conversation_shortcode');
```

---

## Teachable OAuth Integration

For Teachable integration with enrollment verification:

### Setup Steps

1. **In Teachable Admin:**
   - Go to Settings > OAuth apps
   - Click "Add new OAuth app"
   - Enter App name: "SmarterGerman Conversation Tool"
   - Enter Redirect URL: `https://conversation.smartergerman.com/api/teachable/callback`
   - Save and note the Client ID and Client Secret

2. **Find Your School ID:**
   - Look at your Teachable login URL: `https://sso.teachable.com/secure/XXXXX/...`
   - The XXXXX is your School ID

3. **Set GitHub Secrets/Variables:**
   - `TEACHABLE_SCHOOL_ID` (variable): Your school ID
   - `TEACHABLE_CLIENT_ID` (secret): OAuth Client ID
   - `TEACHABLE_CLIENT_SECRET` (secret): OAuth Client Secret
   - `TEACHABLE_REDIRECT_URI` (variable): `https://conversation.smartergerman.com/api/teachable/callback`
   - `TEACHABLE_REQUIRED_COURSES` (variable, optional): Comma-separated course IDs that grant access

### How It Works

1. User clicks "Login with Teachable" on conversation.smartergerman.com
2. Redirects to Teachable OAuth login
3. User authenticates with their Teachable account
4. Teachable redirects back with authorization code
5. Backend exchanges code for access token
6. Backend checks if user is enrolled in a paid/active course
7. If enrolled, generates signed URL and grants access
8. If not enrolled, shows error message

### Course ID Filtering (Optional)

If `TEACHABLE_REQUIRED_COURSES` is set, only users enrolled in those specific courses get access.
If not set, any active paid enrollment grants access.

---

## Environment Variables Summary

| Variable | Required | Description |
|----------|----------|-------------|
| `ACCESS_PASSWORD` | No | Simple password protection |
| `JWT_SECRET` | No | Shared secret for JWT validation |
| `JWT_ALGORITHM` | No | Default: HS256 |
| `JWT_ISSUER` | No | Optional issuer validation |
| `JWT_MAX_AGE` | No | Max token age (default: 3600s) |
| `SIGNED_URL_SECRET` | No | Falls back to JWT_SECRET |
| `CORS_ORIGINS` | Yes | Allowed origins (comma-separated) |
| `DEV_MODE` | No | Set to "false" in production |
| `SESSION_TIME_LIMIT` | No | Max session duration (default: 300s) |
| `TEACHABLE_SCHOOL_ID` | No | Teachable school ID |
| `TEACHABLE_CLIENT_ID` | No | Teachable OAuth client ID |
| `TEACHABLE_CLIENT_SECRET` | No | Teachable OAuth client secret |
| `TEACHABLE_REDIRECT_URI` | No | OAuth callback URL |
| `TEACHABLE_REQUIRED_COURSES` | No | Course IDs required for access |

---

## GitHub Secrets/Variables to Set

**Secrets** (sensitive):
- `ACCESS_PASSWORD` - Your chosen password
- `JWT_SECRET` - Shared secret with course platform (generate with: `openssl rand -hex 32`)
- `TEACHABLE_CLIENT_ID` - Teachable OAuth Client ID
- `TEACHABLE_CLIENT_SECRET` - Teachable OAuth Client Secret

**Variables** (non-sensitive):
- `CORS_ORIGINS` - e.g., `https://conversation.smartergerman.com,https://courses.smartergerman.com`
- `TEACHABLE_SCHOOL_ID` - Your Teachable school ID
- `TEACHABLE_REDIRECT_URI` - `https://conversation.smartergerman.com/api/teachable/callback`
- `TEACHABLE_REQUIRED_COURSES` - (optional) Comma-separated course IDs
