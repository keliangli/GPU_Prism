import { env } from 'cloudflare:workers';
import { handleCollect } from '@/lib/analytics.mjs';

export function POST(request: Request) { return handleCollect(request, env); }
export function OPTIONS(request: Request) { return handleCollect(request, env); }
