// ─────────────────────────────────────────────────────────────────────────────
// app/api/memory/route.ts
// Simple file-based memory system for hackathon (Mission History)
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';

const MISSIONS_FILE = path.join(process.cwd(), 'data', 'missions.json');

// Ensure file exists
async function ensureFile() {
  try {
    await fs.access(MISSIONS_FILE);
  } catch {
    await fs.mkdir(path.dirname(MISSIONS_FILE), { recursive: true });
    await fs.writeFile(MISSIONS_FILE, '[]');
  }
}

export async function GET() {
  try {
    await ensureFile();
    const data = await fs.readFile(MISSIONS_FILE, 'utf-8');
    return NextResponse.json(JSON.parse(data));
  } catch (error) {
    console.error('Memory GET error:', error);
    return NextResponse.json({ error: 'Failed to read memory' }, { status: 500 });
  }
}

const missionSchema = z.object({
  goal: z.string(),
  price: z.number(),
  name: z.string(),
  ts: z.number().optional(),
});

export async function POST(request: Request) {
  try {
    await ensureFile();
    const body = await request.json();
    const parsed = missionSchema.parse(body);

    const data = await fs.readFile(MISSIONS_FILE, 'utf-8');
    const missions = JSON.parse(data);

    const newMission = {
      ...parsed,
      ts: parsed.ts || Date.now(),
    };

    missions.unshift(newMission); // add to top
    if (missions.length > 20) missions.length = 20; // keep last 20

    await fs.writeFile(MISSIONS_FILE, JSON.stringify(missions, null, 2));

    return NextResponse.json({ success: true, mission: newMission });
  } catch (error) {
    console.error('Memory POST error:', error);
    return NextResponse.json({ error: 'Failed to write memory' }, { status: 500 });
  }
}
