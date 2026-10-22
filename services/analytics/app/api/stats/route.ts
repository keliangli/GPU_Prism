import { env } from 'cloudflare:workers';
import { handleStats } from '@/lib/analytics.mjs';

export function GET(request: Request) { return handleStats(request, env); }
