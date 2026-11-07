import Link from "next/link";
import { riskBadYearDetail } from "@/lib/figures";
import { BANDS } from "@/lib/score";
import type { RiskResult } from "@/lib/types";
import { Card, CardBody, CardHeader } from "./card";
import { MoneyFigure } from "./money-figure";
import { LevelLabel, ScoreRing } from "./score";

export function RiskExposureHero({ risks }: { risks: RiskResult[] }) {
  return (
    <Card label="Risk exposure">
      <CardHeader title="Risk exposure" description="Score out of 10 for each risk, from how much a 1-in-20 bad year would cost you." />
      <CardBody className="px-6 py-10">
        <ul className="flex flex-wrap justify-center gap-x-16 gap-y-10">
          {risks.map((risk) => (
            <li key={risk.id} className="flex w-[160px] flex-col items-center text-center">
              <Link
                href={`/risks/${risk.id}`}
                className="group flex flex-col items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
              >
                <ScoreRing score={risk.score} size={140} name={risk.name} />
                <span className="mt-4 text-[15px] font-semibold tracking-tight group-hover:underline">{risk.name}</span>
              </Link>
              <LevelLabel score={risk.score} className="mt-1" />
              <span className="mt-1.5 font-mono text-[12.5px] text-sub">
                <MoneyFigure detail={riskBadYearDetail(risk)} className="text-ink" /> bad year
              </span>
            </li>
          ))}
        </ul>
        <ul aria-label="Score bands" className="mx-auto mt-10 flex max-w-fit flex-wrap justify-center gap-x-6 gap-y-2 border-t border-line pt-5">
          {BANDS.map((band) => (
            <li key={band.level} className="flex items-center gap-2 font-mono text-[12px]">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: band.color }} />
              <span style={{ color: band.text }} className="font-medium">
                {band.level}
              </span>
              <span className="text-sub">{band.range}</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
