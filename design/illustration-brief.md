# E1 Daily Horoscope — icon and avatar illustration brief

Specs for the 8 images that will replace the inline SVG icons on the page.
Generate each one, drop the files into `public/icons/` (avatar into
`public/`) with the exact file names below, and the code will be wired to
use them.

## Shared rules (apply to every icon)

- **Canvas**: 512 x 512 px, PNG with a fully transparent background.
  (SVG export is also fine if your tool supports it.)
- **Safe margin**: keep the artwork inside the middle ~80% of the canvas.
- **One object per image**, centered. No text, no borders, no drop shadow
  baked into the file, no background circle or card.
- **Style**: warm flat illustration with soft gradients and one small white
  highlight, sticker-like, slightly rounded and chubby shapes. Not line art,
  not photoreal, not 3D render, not clip-art outlines.
- **Readability**: these render at 20 to 30 px on the page. Bold simple
  silhouettes only, no thin strokes, no fine detail.
- **Light source**: top-left, consistent across the whole set.
- **Palette anchors** (the set must feel like one family):
  - Brand orange `#F45722`, soft orange `#FA9C70`
  - Gold `#FFBF6E`, sand `#FFEBD2`, cream `#FFF9F1`
  - Per-icon accent colours are listed below; warm and saturated, no neon,
    no pure red, no cold grey.

A good prompt prefix to reuse for all seven icons:

> Flat illustration app icon, sticker style, soft gradients, single centered
> object, chubby rounded shapes, small white highlight top-left, warm palette,
> transparent background, no text, no outline strokes, bold silhouette
> readable at small size.

## The icons

### 1. `mood.png` — mood crystal ball (shows at 30 px in the hero card)
Prompt: prefix + "a glowing purple crystal ball on a small golden stand,
soft lavender to deep violet gradient sphere, tiny white four-point sparkle
inside, gold base #FFBF6E".

### 2. `reading.png` — Today's Reading (21 px, section heading)
Prompt: prefix + "an open holy book with softly curved pages, warm orange
cover #F45722, cream pages #FFF9F1, a small gold star floating above the
middle".

### 3. `love.png` — Love domain (20 px)
Prompt: prefix + "a plump heart with a pink to rose gradient (#F97CA6 to
#E5486E), one small white shine on the upper left".

### 4. `career.png` — Career domain (20 px)
Prompt: prefix + "a friendly briefcase with a blue gradient (#5C8FD6 to
#33639E) and a golden clasp #FFBF6E in the middle".

### 5. `money.png` — Money domain (20 px)
Prompt: prefix + "two overlapping gold coins with a rupee symbol on the
front coin, rich gold gradient (#FFD966 to #C9962C)".

### 6. `health.png` — Health domain (20 px)
Prompt: prefix + "a green gradient heart (#5FBF85 to #2E8B57) with a white
heartbeat pulse line running across it".

### 7. `travel.png` — Travel domain (20 px)
Prompt: prefix + "a round teal compass (#2FA8A0) with a cream face and an
orange #F45722 needle pointing north-east".

## The astrologer avatar

### 8. `astrologer.png` (shows at 52 px in a circle, next to the chat bubble)
- **Canvas**: 1024 x 1024 px. Head-and-shoulders portrait, face centered,
  because the page crops it into a circle.
- Background: solid warm cream `#FFF9F1` (NOT transparent, it fills the
  circle).
- Prompt: "Warm friendly illustrated portrait of an Indian astrologer
  pandit ji, middle-aged man with a neat grey-streaked beard, gentle smile,
  saffron orange kurta and a rudraksha mala, soft flat illustration style
  with gentle gradients, head and shoulders, centered, plain warm cream
  background #FFF9F1, no text".
- Avoid: caricature, cartoon exaggeration, dark or mystical mood, hands.
  He should look like a kind local pandit ji you would trust, not a wizard.

## Delivery checklist

| File | Size | Background |
|---|---|---|
| `public/icons/mood.png` | 512 | transparent |
| `public/icons/reading.png` | 512 | transparent |
| `public/icons/love.png` | 512 | transparent |
| `public/icons/career.png` | 512 | transparent |
| `public/icons/money.png` | 512 | transparent |
| `public/icons/health.png` | 512 | transparent |
| `public/icons/travel.png` | 512 | transparent |
| `public/astrologer.png` | 1024 | cream #FFF9F1 |

Share the files and the inline SVGs in `public/index.html` will be swapped
for `<img>` tags; the avatar is wired through `astrologer.avatarUrl` in
`config/experiment.config.json` (set it to `/astrologer.png`), which is a
config rollout, not a code change.
