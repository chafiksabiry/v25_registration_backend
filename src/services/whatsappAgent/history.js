const MAX_MESSAGES = 30;

/** Garde les derniers messages, en commençant toujours par un message utilisateur « texte » (jamais un tool_result orphelin). */
export function trimHistory(messages, max = MAX_MESSAGES) {
  let out = messages.slice(-max);
  while (out.length && !(out[0].role === 'user' && typeof out[0].content === 'string')) out = out.slice(1);
  return out;
}
