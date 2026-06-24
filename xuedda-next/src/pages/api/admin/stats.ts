import type { APIRoute } from 'astro';
import { getSiteStats } from '../../../lib/content';
import { ok } from '../../../lib/api';

export const GET: APIRoute = async () => ok({ stats: await getSiteStats() });
