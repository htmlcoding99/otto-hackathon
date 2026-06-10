// ─────────────────────────────────────────────────────────────────────────────
// lib/dynamo.ts
// Lazy DynamoDB Document client + table names.
//
// Uses the standard AWS credential chain (AWS_ACCESS_KEY_ID / SECRET /
// SESSION_TOKEN). Returns null when AWS creds are absent so callers can degrade
// gracefully instead of crashing (e.g. local dev without AWS configured).
// ─────────────────────────────────────────────────────────────────────────────

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

let _doc: DynamoDBDocumentClient | null = null;

export function getDocClient(): DynamoDBDocumentClient | null {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return null;
  }
  if (!_doc) {
    const base = new DynamoDBClient({
      region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-west-2",
    });
    // removeUndefinedValues keeps optional fields from blowing up PutCommand.
    _doc = DynamoDBDocumentClient.from(base, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return _doc;
}

// Table: PK userId (S) + SK ts (N). Override the name via env per environment.
export const MISSIONS_TABLE =
  process.env.DYNAMODB_MISSIONS_TABLE || "otto-missions";
