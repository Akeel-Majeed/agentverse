import Link from "next/link";
import { gbp } from "@/lib/format";
import { lossLimitDetail, type LossLimit } from "@/lib/limits";
import { cn } from "@/lib/utils";
import { MoneyFigure } from "./money-figure";

export const LOSS_LIMIT_HREF = "/profile?section=insurance#field-ins.max_loss";

/**
 * The farm's loss limit checked in code against a 1-in-20 bad year. Red when breached, amber when
 * there's no limit or it isn't confirmed (the agent asks rather than assumes), green when within.
 */
export function LossLimitBanner({ status }: { status: LossLimit }) {
  const { limit, confirmed, farmLoss, breached, risksOver } = status;
  const tone = limit === null ? "warn" : breached || risksOver.length ? "bad" : "good";
  const box = {
    warn: "border-warn-border bg-warn-surface",
    bad: "border-bad-border bg-bad-surface",
    good: "border-good-border bg-good-surface",
  }[tone];
  const confirm = (
    <Link href={LOSS_LIMIT_HREF} className="font-medium text-ink underline underline-offset-2 hover:no-underline">
      {limit === null ? "Add your loss limit" : "Confirm it in your farm profile"}
    </Link>
  );

  return (
    <section aria-label="Loss limit" role={tone === "bad" ? "alert" : "status"} className={cn("rounded-[18px] border px-5 py-4 text-[14px] leading-relaxed", box)}>
      {limit === null ? (
        <p>
          <strong className="font-semibold text-warn">No loss limit recorded.</strong> Tell Hedged the largest loss the farm could take in one year
          and every risk is checked against it. {confirm}.
        </p>
      ) : (
        <>
          <p>
            <strong className={cn("font-semibold", tone === "bad" ? "text-bad" : "text-good")}>
              {breached ? "Past your loss limit." : risksOver.length ? "One risk alone is past your loss limit." : "Within your loss limit."}
            </strong>{" "}
            {farmLoss > 0 ? (
              <>A 1-in-20 bad year loses {gbp(farmLoss)} across the farm</>
            ) : (
              <>A 1-in-20 bad year still makes a profit across the farm</>
            )}
            {breached ? ", more than" : farmLoss > 0 ? ", inside" : "; inside"} the{" "}
            <MoneyFigure detail={lossLimitDetail(status)} className="font-semibold text-ink" /> you said the farm could take.
            {risksOver.length ? (
              <> {risksOver.map((r) => `${r.name} alone would lose ${gbp(r.loss)}`).join("; ")}.</>
            ) : null}
          </p>
          {tone === "bad" ? (
            <p className="mt-1 text-[13px] text-sub">
              Each risk page shows which options bring it back inside the limit: options to discuss with your merchant, adviser or bank.
            </p>
          ) : null}
          {!confirmed ? (
            <p className="mt-1 text-[13px] text-sub">
              You haven&apos;t confirmed the {gbp(limit)} limit yet, so Hedged flags against it but won&apos;t treat it as final. {confirm}.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
