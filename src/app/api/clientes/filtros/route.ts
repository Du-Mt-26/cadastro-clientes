/**
 * GET /api/clientes/filtros
 *
 * Returns filter options with aggressive caching (10 minutes).
 * Same shape as the `filters` key in the main API response.
 * Uses stale-while-revalidate pattern.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, getSystemUserIds, type Role } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import {
  buildVisibilityWhere,
  fetchFilterOptions,
} from "@/lib/clientes-api-helpers";

// ─── In-memory cache ────────────────────────────────────────────────

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const filterCache = new Map<string, CacheEntry>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const STALE_TTL = 20 * 60 * 1000; // 20 minutes — serve stale while revalidating

export async function GET(request: NextRequest) {
  try {
    // ── Auth check ──
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const role = (session.user as any).role as Role;
    const userId = (session.user as any).id;
    const userEmail = session.user.email || "";

    const cacheKey = `${role}:${userId}`;
    const now = Date.now();
    const cached = filterCache.get(cacheKey);

    // Fresh cache — return immediately
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      return NextResponse.json(cached.data, {
        headers: {
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=300',
          'X-Cache': 'HIT',
        },
      });
    }

    // Stale cache — return stale and trigger background refresh
    if (cached && (now - cached.timestamp) < STALE_TTL) {
      // Fire-and-forget refresh
      refreshCache(cacheKey, role, userId, userEmail).catch(() => {});
      return NextResponse.json(cached.data, {
        headers: {
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=300',
          'X-Cache': 'STALE',
        },
      });
    }

    // No cache or fully expired — fetch fresh data
    const systemUserIds = await getSystemUserIds();
    const visibilityWhere: Prisma.ClienteWhereInput = buildVisibilityWhere(role, userId, userEmail, systemUserIds);
    const data = await fetchFilterOptions(visibilityWhere, role, userEmail);

    filterCache.set(cacheKey, { data, timestamp: now });

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=300',
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    console.error("Error loading filter options:", error);
    return NextResponse.json(
      { error: "Erro ao carregar filtros" },
      { status: 500 }
    );
  }
}

/**
 * Background cache refresh (fire-and-forget).
 * Updates the cache entry without blocking the response.
 */
async function refreshCache(
  cacheKey: string,
  role: Role,
  userId: string,
  userEmail: string,
): Promise<void> {
  try {
    const systemUserIds = await getSystemUserIds();
    const visibilityWhere: Prisma.ClienteWhereInput = buildVisibilityWhere(role, userId, userEmail, systemUserIds);
    const data = await fetchFilterOptions(visibilityWhere, role, userEmail);
    filterCache.set(cacheKey, { data, timestamp: Date.now() });
  } catch {
    // Silently fail — stale data remains in cache
  }
}
