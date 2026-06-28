import type { APIRoute } from 'astro';
import { ok } from '../../../lib/api';
import { createCaptchaChallenge } from '../../../lib/captcha';

export const GET: APIRoute = async () => ok(createCaptchaChallenge());
