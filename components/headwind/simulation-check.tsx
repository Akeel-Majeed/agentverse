import Link from "next/link";
import type { RiskResult } from "@/lib/types";
import { Card, CardBody, CardHeader, SourceTag } from "./card";

/** The Monte Carlo figure for one risk, beside the hand-checkable working, linked to its trace row. */
export function SimulationCheck({ riskId, simulation: s }: { riskId: string; simulation: NonNullable<RiskResult["simulation"]> }) {
  const paths = s.paths.toLocaleString("en-GB");
  return (
    <Card label="Simulation">
      <CardHeader
        title="Simulation"
        leading={<SourceTag>Computed (code)</SourceTag>}
        action={
          <Link href={`/trace/${s.runId}#risk.${riskId}.p5_hit`} className="text-[13px] font-medium text-brand underline-offset-4 hover:underline">
            View trace
          </Link>
        }
      />
      <CardBody className="flex flex-col gap-2">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[22px] font-semibold tracking-tight tabular">{s.p5HitDisplay}</span>
          <span className="text-[13.5px] text-sub">1-in-20 hit from {paths} simulated years</span>
          <span className="text-[13.5px] font-medium tabular">Score {Math.round(s.score)}/10</span>
        </p>
        <p className="font-mono text-[11.5px] text-sub">
          seed {s.seed} · {paths} paths · config {s.configHash}
        </p>
        <p className="text-[13px] leading-relaxed text-sub">
          The working above is a quick check you can do by hand; the simulation adds fat tails and correlations fitted on Defra
          and Bank of England data up to today.
        </p>
      </CardBody>
    </Card>
  );
}
