import type { APIRoute } from 'astro';
import { ok } from '../../../lib/api';
import { getAiModelCatalog } from '../../../lib/ai-model-health';

// Public by design: it only exposes model availability, never provider keys or errors.
export const GET: APIRoute = async () => ok({ models: await getAiModelCatalog() });
