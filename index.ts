/**
 * Vercel AI Gateway example. A plain "provider/model" string routes through the
 * AI Gateway, which reads AI_GATEWAY_API_KEY from the environment.
 *
 * Run: node --env-file=.env.local index.ts
 */
import { generateText } from "ai";

const { text } = await generateText({
  model: "openai/gpt-5.5",
  prompt: "Invent a new holiday and describe its traditions.",
});

console.log(text);
