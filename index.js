import 'dotenv/config';
import Groq from 'groq-sdk';
import readline from 'readline';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion() {
  rl.question("You: ", async (question) => {
    if (question.toLowerCase() === "exit") {
      console.log("Goodbye!");
      rl.close();
      return;
    }

    const response = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: question,
        },
      ],
      model: "llama-3.3-70b-versatile",
    });

    console.log("\nAI:", response.choices[0].message.content);
    console.log("");

    askQuestion();
  });
}

console.log("=== Ginx AI Chatbot ===");
console.log("Type 'exit' to quit.\n");

askQuestion();