import axios from 'axios';
import { waConfig } from './config.js';

/** Interroge la base de connaissances HARX (v25_knowledgebase_backend : POST /api/rag/query). */
export async function searchKnowledge(query) {
  const c = waConfig();
  const { data } = await axios.post(
    `${c.kbBaseUrl}/api/rag/query`,
    { companyId: c.kbCompanyId, gigId: c.kbGigId || undefined, query },
    { timeout: 30000 },
  );
  return data?.data?.answer || '';
}
