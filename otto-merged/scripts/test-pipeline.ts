// ─────────────────────────────────────────────────────────────────────────────
// scripts/test-pipeline.ts
// Quick smoke-test runner for the OTTO 6-stage pipeline
// Run: npx tsx scripts/test-pipeline.ts
// ─────────────────────────────────────────────────────────────────────────────

import { runOttoPipeline } from "../agents/pipeline";
import type { GoalSpec } from "../types/pipeline";

const TEST_CASES: { name: string; goal: GoalSpec }[] = [
  {
    name: "Matcha Gift",
    goal: {
      taskId: "test-001",
      goal: "Buy my friend a matcha-themed gift under $60, delivered before Friday.",
      budget: 60,
      urgency: "urgent",
      constraints: "eco-friendly, beautiful packaging",
      weights: { value: 7, speed: 8, quality: 6 },
    },
  },
  {
    name: "Headphones WFH",
    goal: {
      taskId: "test-002",
      goal: "Find the best wireless headphones for work from home under $200.",
      budget: 200,
      urgency: "flexible",
      constraints: "noise cancelling, long battery",
      weights: { value: 6, speed: 4, quality: 9 },
    },
  },
  {
    name: "Writer Bundle",
    goal: {
      taskId: "test-003",
      goal: "Get a book and journal bundle for a writer friend. Under $45.",
      budget: 45,
      urgency: "standard",
      constraints: "for writers, thoughtful gift",
      weights: { value: 8, speed: 6, quality: 7 },
    },
  },
];

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  OTTO 2.0 — Pipeline Smoke Test");
  console.log("═══════════════════════════════════════════════════════\n");

  for (const tc of TEST_CASES) {
    console.log(`\n▶ Running: ${tc.name}`);
    console.log(`  Goal:    ${tc.goal.goal}`);
    console.log(`  Budget:  $${tc.goal.budget}  Urgency: ${tc.goal.urgency}`);
    console.log("─".repeat(55));

    const result = await runOttoPipeline(tc.goal);

    if (!result.success) {
      console.error(`  ✗ FAILED at stage: ${result.error.stage}`);
      console.error(`  Message: ${result.error.message}`);
      continue;
    }

    const r = result.result;

    // Pipeline summary
    console.log(`  ✓ Pipeline complete in ${r.totalDurationMs}ms`);
    console.log(`\n  ┌── Reasoning Chain (${r.reasoningChain.length} steps) ─────────────`);
    for (const step of r.reasoningChain) {
      console.log(`  │  [${step.agent}] ${step.action} — ${step.durationMs}ms (conf: ${(step.confidence * 100).toFixed(0)}%)`);
      console.log(`  │    ${step.reasoning.slice(0, 90)}…`);
    }

    console.log(`  └───────────────────────────────────────────────────`);
    console.log(`\n  Decision Twin Profile:`);
    const p = r.decisionTwin.profile;
    console.log(`    Budget Sensitivity: ${p.budgetSensitivity}  |  Delivery Priority: ${p.deliveryPriority}`);
    console.log(`    Quality Focus:      ${p.qualityFocus}  |  Value Orientation:  ${p.valueOrientation}`);
    console.log(`    Dominant Trait:     ${r.decisionTwin.dominantTrait}`);

    console.log(`\n  Research:`);
    console.log(`    Source: ${r.research.source}  |  Found: ${r.research.totalFound} candidates`);

    console.log(`\n  Constraint Analysis:`);
    console.log(`    Passed: ${r.constraintAnalysis.passed.length}  |  Rejected: ${r.constraintAnalysis.rejected.length}  |  Elimination: ${(r.constraintAnalysis.eliminationRate * 100).toFixed(0)}%`);
    if (r.constraintAnalysis.rejected.length > 0) {
      for (const rej of r.constraintAnalysis.rejected) {
        console.log(`    ✗ ${rej.name} — ${rej.rejectedReason}`);
      }
    }

    console.log(`\n  Ranked Candidates:`);
    for (const [i, c] of r.ranked.entries()) {
      const medal = ["🥇", "🥈", "🥉"][i] ?? `  #${i + 1}`;
      console.log(`    ${medal} ${c.name.padEnd(35)} $${c.price.toFixed(2).padStart(7)}  Score: ${c.scores.finalScore}`);
    }

    console.log(`\n  ┌── WINNER ────────────────────────────────────────`);
    console.log(`  │  ${r.winner.name}`);
    console.log(`  │  Price:          $${r.winner.price.toFixed(2)}`);
    console.log(`  │  Delivery:       ${r.winner.deliveryDays} days`);
    console.log(`  │  Rating:         ${r.winner.rating}★`);
    console.log(`  │  Final Score:    ${r.winner.scores.finalScore}/100`);
    console.log(`  │  Confidence:     ${r.confidence}%`);
    console.log(`  │`);
    console.log(`  │  Savings vs avg:  $${r.savingsOptimizer.vsAvgSavings.toFixed(2)}`);
    console.log(`  │  Savings vs max:  $${r.savingsOptimizer.estimatedSavings.toFixed(2)}`);
    console.log(`  │  Budget left:     $${r.savingsOptimizer.budgetRemaining.toFixed(2)}`);
    console.log(`  │`);
    console.log(`  │  Narrative:`);
    console.log(`  │  ${r.finalReasoning.slice(0, 150)}…`);
    console.log(`  └───────────────────────────────────────────────────\n`);
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  All test cases complete.");
  console.log("═══════════════════════════════════════════════════════\n");
}

main().catch(console.error);
