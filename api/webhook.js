import axios from "axios";
import fs from "fs";
import path from "path";
import Groq from "groq-sdk";

// =========================
// LOAD KNOWLEDGE BASE
// =========================
const knowledge = fs.readFileSync(
  path.join(process.cwd(), "knowledge.txt"),
  "utf-8"
);

// =========================
// GROQ SETUP
// =========================
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// =========================
// HANDLER
// =========================
export default async function handler(req, res) {
  // =========================
  // FACEBOOK VERIFY
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

      // =========================
      // HUMAN HANDOFF CHECK (FAST EXIT)
      // =========================
      const handoffKeywords = [
        "human",
        "owner",
        "real person",
        "call me",
        "connect me",
        "talk to someone",
        "staff"
      ];

      const isHandoff = handoffKeywords.some(word =>
        messageText.toLowerCase().includes(word)
      );

      if (isHandoff) {
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

        return res.status(200).send("EVENT_RECEIVED");
      }

      // =========================
      // AI RESPONSE
      // =========================
      const completion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `
You are the official booking assistant for BR Zimmer (beach transient house in Bagasbas, Philippines).

KNOWLEDGE BASE:
${knowledge}

STYLE RULES:
- Keep replies VERY short (max 1–2 sentences)
- No long explanations
- No paragraphs
- Chat-like tone (Messenger style)

BUSINESS RULES:
- If asked for price or rates → "Please message the owner for pricing and discounts."
- Do not invent prices
- If asked availability → ask for exact dates
- Check-in: 2:00 PM | Check-out: 11:00 AM
- Encourage booking via Airbnb or page

HUMAN HANDOFF RULE:
If user requests human/owner/staff:
STOP everything and do not continue conversation.

PRICING & BOOKING RULES:

- Standard rate: ₱1,600 per night
- Maximum guests: 4 people

IMPORTANT PRICING BEHAVIOR:
- If user asks "how much", "price", "rate", "per night":
  → Reply ONLY: "₱1,600 per night. Please message the owner for discounts and final confirmation."

- If user mentions LONG STAY (5 nights or more, or words like "week", "long stay", "vacation stay"):
  → DO NOT give price
  → Reply ONLY: "Got it 👍 For long stays, please message the owner so we can arrange a discount for you."

- Never calculate total cost for long stays
- Never negotiate price

GOAL:
Help users book quickly and efficiently.
`
          },
          {
            role: "user",
            content: messageText
          }
        ]
      });

      const reply = completion.choices[0].message.content;

      // =========================
      // SEND TO FACEBOOK
      // =========================
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
    } catch (error) {
      console.error("Webhook Error:", error);
      return res.status(200).send("ERROR_HANDLED");
    }
  }

  return res.status(405).send("Method Not Allowed");
}