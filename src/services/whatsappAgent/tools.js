import { searchKnowledge } from './knowledgeBase.js';

export const agentTools = [
  {
    name: 'search_harx_knowledge',
    description: "Recherche dans la base de connaissances HARX (documentation, procédures, FAQ). À utiliser pour toute question sur HARX. Formule une requête claire et autonome.",
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Question ou mots-clés à rechercher' } },
      required: ['query'],
    },
  },
  {
    name: 'escalate_to_human',
    description: "Transfère la conversation à un conseiller humain. À utiliser si tu n'as pas de solution fiable ou si l'utilisateur le demande.",
    input_schema: {
      type: 'object',
      properties: { reason: { type: 'string', description: "Motif court de l'escalade" } },
      required: ['reason'],
    },
  },
];

export async function runTool(name, input, { onEscalate } = {}) {
  try {
    if (name === 'search_harx_knowledge') {
      const answer = await searchKnowledge(String(input?.query || ''));
      return answer || 'Aucun résultat pertinent trouvé dans la base de connaissances.';
    }
    if (name === 'escalate_to_human') {
      await onEscalate?.(String(input?.reason || ''));
      return "Escalade enregistrée. Informe poliment l'utilisateur qu'un conseiller le recontactera.";
    }
    return `Outil inconnu: ${name}`;
  } catch (err) {
    console.error(`[whatsapp-agent] outil ${name} en échec:`, err.message);
    return `Erreur lors de l'exécution de l'outil (${err.message}).`;
  }
}
