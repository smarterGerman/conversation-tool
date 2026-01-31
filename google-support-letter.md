# Request: Increase Gemini Live API Message Limit for Vertex AI

**Subject:** Session message limit (1000) prevents real-time voice conversations from reaching useful duration

---

## Issue

We're building a German language learning application using the Gemini Live API via Vertex AI (`gemini-live-2.5-flash-native-audio`). Sessions terminate after exactly 1000 messages, which results in conversations lasting only ~1.5 minutes.

## Technical Details

- **Project:** smartergerman-conversation
- **Model:** gemini-live-2.5-flash-native-audio
- **Region:** us-central1
- **API:** Vertex AI (not AI Studio)
- **Use case:** Real-time voice conversation for language learning

## The Problem

The 1000 message limit counts **both input and output** messages:
- Our audio input: ~2 messages/second (8192-sample buffer at 16kHz)
- Gemini audio output: ~9 messages/second (small audio chunks)
- **Total:** ~11 messages/second = **~90 seconds max session**

For effective language practice, users need 5-10 minute conversations minimum.

## What We've Tried

1. **Session resumption** - Implemented but native audio model doesn't seem to return resumption tokens
2. **Context compression** - Disabled; caused more frequent premature stops (GitHub #117)
3. **Audio batching** - Adds unacceptable latency for real-time conversation

## Request

1. **Increase the 1000 message limit** for Vertex AI customers, or
2. **Provide a configuration option** to set a higher limit, or
3. **Confirm if session resumption** works with native audio models (we're not receiving `session_resumption_update` messages)

## Willingness to Pay

We're already using Vertex AI (pay-as-you-go) and are considering Provisioned Throughput. We're happy to pay for increased limits if that's an option.

## Contact

- Email: [your-email]
- GCP Project: smartergerman-conversation

---

*This is blocking our production deployment for ~1,000 active language learners.*
