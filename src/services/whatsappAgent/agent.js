import Anthropic from '@anthropic-ai/sdk';
import { waConfig } from './config.js';
import { buildSystemPrompt } from './prompt.js';
import { agentTools, runTool } from './tools.js';

const MAX_TOOL_ROUNDS = 5;
export const FALLBACK_REPLY = "Désolé, je rencontre un souci technique. Un conseiller va reprendre votre demande.";

let client;
const getClient = () => (client ??= new Anthropic({ apiKey: waConfig().anthropicApiKey }));

/**
 * Fait répondre Claude à partir de l'historique + du nouveau message.
 * Renvoie { reply, messages } où `messages` est l'historique mis à jour (à persister).
 */
export async function runAgent({ history, text, userName, onEscalate }) {
  const c = waConfig();
  const messages = [...history, { role: 'user', content: text }];
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await getClient().messages.create({
        model: c.model,
        max_tokens: c.maxTokens,
        system: buildSystemPrompt({ userName }),
        tools: agentTools,
        messages,
      });
      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason !== 'tool_use') {
        const reply = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        return { reply: reply || FALLBACK_REPLY, messages };
      }

      const results = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          results.push({ type: 'tool_result', tool_use_id: block.id, content: await runTool(block.name, block.input, { onEscalate }) });
        }
      }
      messages.push({ role: 'user', content: results });
    }
  } catch (err) {
    console.error('[whatsapp-agent] erreur Claude:', err.message);
  }
  // Échec : on ne persiste pas ce tour (historique intact).
  return { reply: FALLBACK_REPLY, messages: history };
}
