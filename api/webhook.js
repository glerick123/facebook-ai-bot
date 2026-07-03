import axios from "axios";
import fs from "fs";
import path from "path";
import Groq from "groq-sdk";

// =========================
// SIMPLE MEMORY STORE (Vercel-safe best effort)
// =========================
const userMode = new Map();

// =========================
// LOAD KNOWLEDGE BASE
// =========================
let knowledge = "";
try {
  knowledge = fs.readFileSync(
    path.join(process.cwd(), "knowledge.txt"),
    "utf-8"
  );
} catch (e) {
  knowledge = "No knowledge base found.";
}

// =========================
// GROQ SETUP
// =========================
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export default async function handler(req, res) {
  // =========================
  // FACEBOOK VERIFICATION
  // =========================
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }

    return res.status(403).send("Forbidden");
  }

  // =========================
  // MESSAGES
  // =========================
  if (req.method === "POST") {
    try {
      const body = req.body;

      const entry = body.entry?.[0];
      const event = entry?.messaging?.[0];

      const senderId = event?.sender?.id;
      const messageText = event?.message?.text;

      if (!senderId || !messageText) {
        return res.status(200).send("OK");
      }

      const text = messageText.toLowerCase();

      // =====================================================
      // 1. HUMAN HANDOFF TRIGGER
      // =====================================================
      const handoffKeywords = [
        "human",
        "owner",
        "real person",
        "call me",
        "connect me",
        "talk to someone",
        "staff"
      ];

      const isHandoff = handoffKeywords.some(k => text.includes(k));

      if (isHandoff) {
        userMode.set(senderId, "HUMAN");

        await axios.post(
          "https://graph.facebook.com/v19.0/me/messages",
          {
            recipient: { id: senderId },
            message: {
              text: "Got it 👍 Connecting you to the owner now. Please wait a moment."
            }
          },
          {
            params: {
              access_token: process.env.PAGE_ACCESS_TOKEN
            }
          }
        );

        return res.status(200).send("HANDOFF_OK");
      }

      // =====================================================
      // 2. BLOCK BOT IF USER IS IN HUMAN MODE
      // =====================================================
      if (userMode.get(senderId) === "HUMAN") {
        const resetKeywords = ["bot", "continue", "assistant"];

        const reset = resetKeywords.some(k => text.includes(k));

        if (!reset) {
          await axios.post(
            "https://graph.facebook.com/v19.0/me/messages",
            {
              recipient: { id: senderId },
              message: {
                text: "You are now connected to the owner. Please wait or type 'bot' to return."
              }
            },
            {
              params: {
                access_token: process.env.PAGE_ACCESS_TOKEN
              }
            }
          );

          return res.status(200).send("BLOCKED_HUMAN");
        }

        userMode.set(senderId, "BOT");
      }

      // =====================================================
      // 3. AI RESPONSE (ONLY IF NOT BLOCKED)
      // =====================================================
      const completion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `
You are the booking assistant for BR Zimmer (Bagasbas Beach, Philippines).

KNOWLEDGE:
${knowledge}

RULES:
- Keep replies VERY short (max 1–2 sentences)
- Friendly Messenger tone
- No long explanations

BOOKING RULES:
- Price: ₱1,600 per night
- Max guests: 4
- If asked price → "₱1,600 per night. Please message the owner for discounts."
- If 5+ nights or long stay → "Please message the owner for long-stay discount."
- If asked availability → ask for dates
- Check-in: 2:00 PM | Check-out: 11:00 AM
`
          },
          {
            role: "user",
            content: messageText
          }
        ]
      });

      const reply = completion.choices[0].message.content;

      // =====================================================
      // 4. SEND MESSAGE TO FACEBOOK
      // =====================================================
      await axios.post(
        "https://graph.facebook.com/v19.0/me/messages",
        {
          recipient: { id: senderId },
          message: { text: reply }
        },
        {
          params: {
            access_token: process.env.PAGE_ACCESS_TOKEN
          }
        }
      );

      return res.status(200).send("EVENT_RECEIVED");
    } catch (err) {
      console.error("Webhook Error:", err);
      return res.status(200).send("ERROR_HANDLED");
    }
  }

  return res.status(405).send("Method Not Allowed");
}