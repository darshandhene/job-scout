import { NextResponse } from "next/server";
import { jsonError } from "@/lib/route";
import { setJobStatus } from "@/lib/service";
import type { JobStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUSES = new Set<JobStatus>(["new", "saved", "applied", "dismissed"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { status?: JobStatus };
    if (!body.status || !STATUSES.has(body.status)) {
      return NextResponse.json({ error: "Choose new, saved, applied, or dismissed." }, { status: 400 });
    }
    return NextResponse.json({ state: await setJobStatus(id, body.status) });
  } catch (error) {
    return jsonError(error);
  }
}
