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
      <CardBody className="px-5 py-8">
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-8 sm:gap-x-12">
          {risks.map((risk) => (
            <li key={risk.id} className="flex w-[136px] flex-col items-center text-center sm:w-[160px]">
              <Link
                href={`/risks/${risk.id}`}
                className="group flex flex-col items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
              >
                <ScoreRing score={risk.score} size={132} name={risk.name} />
                <span className="mt-4 text-[14.5px] font-medium tracking-[-0.03em] group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-4">
                  {risk.name}
                </span>
              </Link>
              <LevelLabel score={risk.score} className="mt-1" />
              <span className="mt-1.5 text-[12.5px] text-sub">
                <MoneyFigure detail={riskBadYearDetail(risk)} className="font-medium text-ink" /> in a bad year
              </span>
            </li>
          ))}
        </ul>
        <ul aria-label="Score bands" className="mx-auto mt-8 flex max-w-fit flex-wrap justify-center gap-x-5 gap-y-2 border-t border-line pt-4">
          {BANDS.map((band) => (
            <li key={band.level} className="flex items-center gap-2 text-[12.5px]">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: band.color }} />
              <span style={{ color: band.text }} className="font-medium">
                {band.level}
              </span>
              <span className="text-sub tabular">{band.range}</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
