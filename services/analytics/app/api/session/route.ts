import { env } from 'cloudflare:workers';
import { handleSession } from '@/lib/analytics.mjs';

export function POST(request: Request) { return handleSession(request, env); }
export function OPTIONS(request: Request) { return handleSession(request, env); }
