// ─────────────────────────────────────────────────────────────────────────────
// app/api/memory/route.ts
// Persistent mission-history memory backed by DynamoDB.
//
// Replaces the old local-file store (data/missions.json), which silently breaks
// on serverless hosts like Vercel where the filesystem is read-only/ephemeral.
// Table schema: PK userId (S), SK ts (N). See lib/dynamo.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { z } from "zod";
import { QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { getDocClient, MISSIONS_TABLE } from "@/lib/dynamo";

// No auth in the app yet, so missions share one logical "global" partition.
// A real userId can be passed through to scope history per user later.
const DEFAULT_USER = "global";
const MAX_ITEMS = 20;

export async function GET(request: Request) {
  const doc = getDocClient();
  // No AWS creds configured → behave like an empty store rather than erroring.
  if (!doc) return NextResponse.json([]);

  const userId = new URL(request.url).searchParams.get("userId") || DEFAULT_USER;

  try {
    const res = await doc.send(
      new QueryCommand({
        TableName: MISSIONS_TABLE,
        KeyConditionExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": userId },
        ScanIndexForward: false, // sort by ts descending → newest first
        Limit: MAX_ITEMS,
      })
    );

    const missions = (res.Items || []).map((it) => ({
      goal: it.goal,
      price: it.price,
      name: it.name,
      ts: it.ts,
    }));

    return NextResponse.json(missions);
  } catch (error) {
    console.error("Memory GET error:", error);
    return NextResponse.json({ error: "Failed to read memory" }, { status: 500 });
  }
}

const missionSchema = z.object({
  goal: z.string(),
  price: z.number(),
  name: z.string(),
  ts: z.number().optional(),
  userId: z.string().optional(),
});

export async function POST(request: Request) {
  const doc = getDocClient();
  if (!doc) {
    return NextResponse.json(
      { error: "Memory store not configured (no AWS credentials)" },
      { status: 503 }
    );
  }

  try {
    const parsed = missionSchema.parse(await request.json());

    const mission = {
      userId: parsed.userId || DEFAULT_USER,
      ts: parsed.ts || Date.now(),
      goal: parsed.goal,
      name: parsed.name,
      price: parsed.price,
    };

    await doc.send(new PutCommand({ TableName: MISSIONS_TABLE, Item: mission }));

    return NextResponse.json({ success: true, mission });
  } catch (error) {
    console.error("Memory POST error:", error);
    return NextResponse.json({ error: "Failed to write memory" }, { status: 500 });
  }
}
