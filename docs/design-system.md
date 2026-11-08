# Hedged — Design System

The look and the rules behind the Hedged pitch deck. Use it to keep new slides, the product UI and the site consistent.

## Principles

- **Calm, not loud.** Soft light backgrounds, one idea per slide, a lot of empty space.
- **Colour has a job.** Ink and paper do most of the work. Colour marks the audience, risk, or one highlight.
- **Show the product.** Prefer real-looking UI (cards, chats, gauges) to bullet lists.
- **Numbers lead.** A big figure with a one-line label beats a sentence.

## Colour

| Token | Hex | Use |
|---|---|---|
| Ink | `#121611` | Headings, body text, dark cards, buttons |
| Muted | `#565C50` | Secondary text, labels, footers |
| Paper | `#F6F5EC` | Slide background |
| Card | `#FDFDF8` | White cards |
| Lime | `#C9DB6A` | Highlights, accent on dark, "built today" |
| Farmers | `#6E8F0A` | Small square marker for farmers |
| Banks and funds | `#2B4BC8` | Small square marker for banks and funds |
| Risk red | `#C8361C` | Losses, severe risk, "what it misses" |
| Hairline | Ink at 8–14% opacity | Dividers, footer rule |

**Sky gradient** (cover, statement slide, closing slide): linear, `#C4D865` → `#D9E48E` → `#ECEFC4` → `#F6F5EC` from top to bottom. Add soft white radial "clouds" and a fine grain on top.
**Content slides:** paper background with a faint lime glow in the top-right corner, plus the same grain.

Risk scale (gauges): Severe `#C8361C` · High `#D86A1E` · Moderate `#D9A800` · Low `#7FA20E`. Always pair the colour with the word.

## Typography

One typeface: **Geist** (Google Fonts).

| Role | Size (1920×1080 canvas) | Weight | Tracking |
|---|---|---|---|
| Cover title | 200px | 500 | −4% |
| Statement / big number | 120px | 500 | −4% |
| Slide heading | 80px | 500 | −4% |
| Subheading / key line | 44px | 500 | −3% |
| Body | 32px | 400 | 0 |
| Label / footer | 24px | 500 / 400 | 0 |

- Sentence case everywhere. Headings end with a full stop.
- Body line height 1.4, headings 1.05.
- For emphasis, switch between ink and muted text within the same line, not between sizes.
- Nothing smaller than 24px.

## Layout

- 16:9 canvas, 128px side margins.
- **Top-left mark:** a small ink square followed by "Hedged", on every slide.
- **Top-right:** the audience tag (coloured square + "For farmers" / "For banks and funds") or the section name.
- **Footer:** a hairline rule, sources or demo notes on the left, page number on the right.
- Headings sit in the same place on every content slide.

## Components

- **Card:** `#FDFDF8`, 28–36px corner radius, soft shadow (`0 16px 48px` ink at 7%). No borders.
- **Dark card:** ink background, paper text, a lime label. Use it for "the engine" or the bank's system view.
- **Dashed card:** a 2px dashed outline with no fill, for what is missing or invisible.
- **Pill:** fully rounded. White pills for chips or tags; ink pills with an arrow (→) for actions ("One dashboard →", "Next →").
- **List rows:** separated by hairlines, not bullets. A bold lead plus muted detail.
- **Gauge:** a thin ring on a light track, the score centred inside, with the risk name, level and £ value below.
- **Chat:** iMessage-style bubbles (grey received, blue sent) to show the farmer's view.

## Slide types

1. **Sky slide:** cover, single-sentence statement, closing.
2. **Stat slide:** heading plus a row of three cards with big numbers.
3. **Comparison slide:** two or three cards side by side (sees / misses / at stake).
4. **Flow slide:** inputs → dark engine card → outputs.
5. **Product slide:** one large card that looks like the app (dashboard, hedge table, chat).

## Don'ts

- No extra colours, gradients on cards, or emoji.
- Don't use red or lime decoratively. They carry meaning.
- No dense bullet lists. Split the slide instead.
- Don't mix in other typefaces.

## In the app

The product UI uses the same system at screen scale. Tokens live in `tailwind.config.ts` and `app/globals.css`; components should use the tokens, not hex values.

| Deck | App token | Notes |
|---|---|---|
| Ink `#121611` | `ink`, `--foreground`, `--primary` | Text, primary buttons, focus ring |
| Muted `#565C50` | `sub`, `--muted-foreground` | Secondary text and labels |
| Paper `#F6F5EC` | `paper`, `--background` | Page background, with the lime glow and grain on `body` |
| Card `#FDFDF8` | `bg-card`, `--card` | Cards, inputs, popovers |
| Hairline | `line` `#DFDFD6`, `line-strong` `#D2D1C9` | Dividers and input borders (ink at about 10% and 16% on paper) |
| Lime `#C9DB6A` | `lime`, `lime-surface` `#EEF2CF` | One highlight: progress, selection, focus glow, takeaway panels (`brand-surface`) |
| Farmers `#6E8F0A` | `farmers` | Square marker next to the farm |
| Banks and funds `#2B4BC8` | `banks` | Square marker for anything bank-facing |
| Risk red `#C8361C` | `bad`, `bad-surface`, `bad-border` | Losses and severe risk |
| Sky gradient | `.bg-sky` utility | First and last screens of setup |

**Risk scale** (`lib/score.ts`): fills use the deck colours (Severe `#C8361C`, High `#D86A1E`, Moderate `#D9A800`, Low `#7FA20E`). Text uses the same hue darkened to pass 4.5:1 contrast on paper: Low `#556F06` (also `good`), Moderate `#8A6A00` (also `warn`, for "please check"), High `#A6500F`, Severe unchanged. These darker shades are the only additions to the palette.

**Type at screen scale:** Geist throughout. Headings and big figures weight 500, tracking −3% to −4%, line height 1.05 (page titles 32px, setup headings 42–56px). Body 14–18px. Small labels stay legible (no smaller than 11px in dense tables).

**Components:**
- **Cards:** `rounded-card` (20px), `bg-card`, `shadow-card` (`0 16px 48px` ink at 7%), no border. Hairlines divide rows inside a card.
- **Buttons:** pills (`rounded-full`). Primary is ink with paper text; secondary is a card-coloured pill with a hairline. Setup's main action is a large ink pill with →.
- **Chat:** the "Ask Hedged" panel (bottom right) uses iMessage-style bubbles: grey (`hover` `#E9E8DC`) for the assistant, blue `#1F6FEB` for the farmer, as the deck's chat. That blue is for chat bubbles only.
- **Mark:** `Wordmark` in `components/headwind/logo.tsx`: a small ink square plus "Hedged".
