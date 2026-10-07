import prisma from "../utils/prisma";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";

export interface ActivePeriodData {
  id: string;
  startDate: Date;
  endDate: Date;
  sessionId: string;
  termId: string;
  updatedAt: Date;
  session?: { id: string; name: string } | null;
  term?: { id: string; name: string } | null;
}

function isPrismaKnownErrorWithCode(e: unknown): e is { code: string } {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as any).code === "string";
}

export class ActivePeriodService {
  private prisma = prisma;

  private async assertSessionExists(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true },
    });
    if (!session) throw new Error("Invalid sessionId");
  }

  private async assertTermExists(termId: string) {
    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      select: { id: true },
    });
    if (!term) throw new Error("Invalid termId");
  }

  async getActivePeriod(): Promise<ActivePeriodData | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        start_date: Date;
        end_date: Date;
        session_id: string;
        term_id: string;
        updated_at: Date | null;
        session_name: string | null;
        term_name: string | null;
      }>
    >(Prisma.sql`
      SELECT
        ap.id,
        ap.start_date,
        ap.end_date,
        ap.session_id,
        ap.term_id,
        CASE
          WHEN ap.updated_at IS NULL OR ap.updated_at = '0000-00-00 00:00:00' THEN NULL
          ELSE ap.updated_at
        END AS updated_at,
        s.name AS session_name,
        t.name AS term_name
      FROM active_period ap
      LEFT JOIN sessions s ON s.id = ap.session_id
      LEFT JOIN terms t ON t.id = ap.term_id
      ORDER BY
        CASE WHEN ap.updated_at IS NULL OR ap.updated_at = '0000-00-00 00:00:00' THEN 1 ELSE 0 END ASC,
        ap.updated_at DESC
      LIMIT 1
    `);

    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      startDate: r.start_date,
      endDate: r.end_date,
      sessionId: r.session_id,
      termId: r.term_id,
      updatedAt: r.updated_at ?? new Date(0),
      session: r.session_name ? { id: r.session_id, name: r.session_name } : null,
      term: r.term_name ? { id: r.term_id, name: r.term_name } : null,
    };
  }

  /**
   * Upsert a singleton record. If multiple exist (shouldn't happen), keeps the
   * newest and deletes the rest.
   */
  async upsertActivePeriod(input: {
    startDate: Date;
    endDate: Date;
    sessionId: string;
    termId: string;
  }): Promise<ActivePeriodData> {
    await this.assertSessionExists(input.sessionId);
    await this.assertTermExists(input.termId);

    if (input.startDate.getTime() > input.endDate.getTime()) {
      throw new Error("startDate must be before or equal to endDate");
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT ap.id
          FROM active_period ap
          ORDER BY
            CASE WHEN ap.updated_at IS NULL OR ap.updated_at = '0000-00-00 00:00:00' THEN 1 ELSE 0 END ASC,
            ap.updated_at DESC
          LIMIT 1
        `);

        const now = new Date();

        const id = existing[0]?.id ?? randomUUID();

        if (existing[0]?.id) {
          await tx.$executeRaw(Prisma.sql`
            UPDATE active_period
            SET
              start_date = ${input.startDate},
              end_date = ${input.endDate},
              session_id = ${input.sessionId},
              term_id = ${input.termId},
              updated_at = ${now}
            WHERE id = ${id}
          `);
        } else {
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO active_period (id, start_date, end_date, session_id, term_id, updated_at)
            VALUES (${id}, ${input.startDate}, ${input.endDate}, ${input.sessionId}, ${input.termId}, ${now})
          `);
        }

        // Enforce singleton table.
        await tx.$executeRaw(Prisma.sql`DELETE FROM active_period WHERE id <> ${id}`);

        const saved = await tx.$queryRaw<
          Array<{
            id: string;
            start_date: Date;
            end_date: Date;
            session_id: string;
            term_id: string;
            updated_at: Date | null;
            session_name: string | null;
            term_name: string | null;
          }>
        >(Prisma.sql`
          SELECT
            ap.id,
            ap.start_date,
            ap.end_date,
            ap.session_id,
            ap.term_id,
            CASE
              WHEN ap.updated_at IS NULL OR ap.updated_at = '0000-00-00 00:00:00' THEN NULL
              ELSE ap.updated_at
            END AS updated_at,
            s.name AS session_name,
            t.name AS term_name
          FROM active_period ap
          LEFT JOIN sessions s ON s.id = ap.session_id
          LEFT JOIN terms t ON t.id = ap.term_id
          WHERE ap.id = ${id}
          LIMIT 1
        `);

        const r = saved[0];
        if (!r) throw new Error("ActivePeriod not found");
        return {
          id: r.id,
          startDate: r.start_date,
          endDate: r.end_date,
          sessionId: r.session_id,
          termId: r.term_id,
          updatedAt: r.updated_at ?? new Date(0),
          session: r.session_name ? { id: r.session_id, name: r.session_name } : null,
          term: r.term_name ? { id: r.term_id, name: r.term_name } : null,
        };
      });
    } catch (e) {
      if (isPrismaKnownErrorWithCode(e) && e.code === "P2025") {
        // In case primaryId row disappeared mid-flight.
        throw new Error("ActivePeriod not found");
      }
      throw e;
    }
  }
}

export const activePeriodService = new ActivePeriodService();

