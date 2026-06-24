import type { APIRoute } from 'astro';
import { ok } from '../../../lib/api';

export const GET: APIRoute = async ({ locals }) => ok({ admin: locals.admin });
