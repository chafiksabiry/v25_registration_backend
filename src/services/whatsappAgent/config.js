// Configuration de l'agent WhatsApp (lue à l'usage pour faciliter les tests).
export const waConfig = () => ({
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
  appSecret: process.env.WHATSAPP_APP_SECRET || '',
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  model: process.env.WHATSAPP_AGENT_MODEL || 'claude-sonnet-5-5',
  maxTokens: Number(process.env.WHATSAPP_AGENT_MAX_TOKENS || 1024),
  kbBaseUrl: (process.env.KB_BASE_URL || '').replace(/\/$/, ''),
  kbCompanyId: process.env.WHATSAPP_KB_COMPANY_ID || '',
  kbGigId: process.env.WHATSAPP_KB_GIG_ID || '',
});

/** Le webhook n'accepte du trafic que si tout le nécessaire est configuré. */
export const isWhatsappAgentConfigured = () => {
  const c = waConfig();
  return Boolean(c.verifyToken && c.appSecret && c.accessToken && c.phoneNumberId && c.anthropicApiKey && c.kbBaseUrl && c.kbCompanyId);
};
