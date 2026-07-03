import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  // Facebook Verification
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

    return res.sendStatus(403);
  }

  // Facebook Messages
  if (req.method === "POST") {
    console.log(JSON.stringify(req.body, null, 2));

    return res.status(200).send("EVENT_RECEIVED");
  }

  return res.sendStatus(405);
}