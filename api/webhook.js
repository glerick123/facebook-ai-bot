import axios from "axios";
import fs from "fs";
import Groq from "groq-sdk";

// Load knowledge base
import path from "path";

const knowledge = fs.readFileSync(
  path.join(process.cwd(), "knowledge.txt"),
  "utf-8"
);

// Groq setup
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export default async function handler(req, res) {
  // =========================
  // META VERIFICATION
  // =========================
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (
      mode === "subscribe" &&
      token === process.env.VERIFY_TOKEN
    ) {
      return res.status(200).send(challenge);
    }

    return res.status(403).send("Forbidden");
  }

  // =========================
  // MESSAGES HANDLER
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
      // AI RESPONSE (BR ZIMMER)
      // =========================
      const completion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `
You are the official booking assistant for BR Zimmer (beach transient house in Bagasbas, Philippines).

Use this knowledge base:

${knowledge}

RULES:
- If asked for price → ALWAYS say: "Please message the owner for pricing and discounts."
- Be friendly, short, and helpful
- Always encourage booking via Airbnb or direct page
- Check-in: 2:00 PM
- Check-out: 11:00 AM
- If long stay → suggest possible discount (do NOT give exact price)
- Be accurate based on knowledge base only
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
      // SEND BACK TO FACEBOOK
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