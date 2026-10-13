# Debug log

All ten fixed. For each one: how I got it to happen, what was actually wrong,
and what I changed.

I tried to fix causes rather than hide symptoms. Two of these turned out to be
linked, which I've noted where it matters.

---

## CC-01 — Search suggestions stuck behind the page

**Reproduced:** Typed into the search box and tried to click the lower part of
the dropdown. The click went to the category bar behind it instead.

**Cause:** This looked like a missing `z-index`, but the dropdown already had
`z-index: 100`. The problem is that a `z-index` only competes with its
siblings, inside its own stacking context. `.search-wrap` has `position:
relative` and `z-index: 1`, and that combination creates a stacking context —
so everything inside it, including the `100`, gets flattened into one layer
worth `1` as far as the outside world is concerned. The category bar is a
sibling at `40`, so it wins.

**Fix:** Raised `.search-wrap` to `z-index: 60` so the whole search area
outranks the category bar.

I left the `100` alone. Raising a number that's trapped in the wrong context is
what hid this in the first place.

**Checked:** Every part of the dropdown is clickable now. The category bar
still sits above the menu when you scroll.

---

## CC-02 — Dark mode unreadable

**Reproduced:** Switched to dark mode — dish names and prices nearly vanished
against the card.

**Cause:** `.dish-body` sets `color: #2b2118` directly instead of using
`var(--ink)`. The theme works by redefining variables, so a hardcoded colour
simply opts out of it. The name and price have no colour of their own, so they
inherit the hardcoded one.

Two things this explains:

- The grey line under the name stayed readable because it uses `var(--muted)`
  explicitly.
- Light mode looks fine either way, because `--ink` in light mode *is*
  `#2b2118`. The bug was invisible in the theme you'd normally develop in.

Some people see it without touching the toggle because the app picks the
starting theme from the OS setting.

**Fix:** `.dish-body { color: var(--ink); }`

---

## CC-03 — Menu wider than the phone

**Reproduced:** Not at 390px — at that width the layout drops to one column and
hides the overflow. The complaint mentions "right-hand dishes", so it needs two
columns. At around 600px the grid spilled past the screen and the buttons on
the right-hand cards were cut off.

**Cause:** `1fr` is short for `minmax(auto, 1fr)`, and that `auto` minimum is
the item's min-content width — the narrowest it can be without its contents
spilling. A grid track won't shrink below that, so a card that refuses to get
narrower inflates its own column.

What refused to shrink was the image rule on small screens: `width: auto` with
`min-width: 100%` means the image contributes its natural width as a minimum.
`.name-btn { width: max-content }` did the same for long dish names.

**Fix:**

- all `.menu-grid` tracks are `minmax(0, 1fr)`, so columns can shrink
- `.dish-card img` is `width: 100%; min-width: 0`
- `.name-btn` is `max-width: 100%`

I didn't use `overflow-x: hidden` on a wider breakpoint. That hides the
scrollbar and leaves the button genuinely off screen — which is the complaint,
not the symptom. (See CC-05 for what that hack had already caused.)

---

## CC-04 — Buttons dead on tablets

**Reproduced:** Only between 761px and 900px. Add to Cart and the star did
nothing, while looking completely normal. Fine on laptop and phone.

**Cause:** A media query for that width band adds two decorative `::after`
overlays to every card — a strip across the bottom and a square in the top
right. They're transparent, so you can't see them, but a transparent element
still receives clicks. The strip sits exactly over Add to Cart and the square
sits exactly over the star.

The buttons look normal because they *are* normal. Nothing was reaching them.

**Fix:** `pointer-events: none` on both overlays, so they still tint blocked
cards but stop swallowing clicks.

I checked first that nothing relied on the overlay to block interaction — the
app already renders the button with `disabled` when a dish isn't orderable, so
that's handled properly elsewhere.

---

## CC-05 — Filter bar not sticky on phones

**Reproduced:** On a narrow screen, scrolled down — the bar scrolled away. The
`position: sticky` rule was there and applied, so it wasn't missing or
overridden. It was being switched off.

**Cause:** `position: sticky` stops working if an **ancestor** has an
`overflow` other than `visible` — the element then sticks inside that scroll
container instead of the viewport, and there's nowhere to stick. The phone
breakpoint had `.view { overflow-x: hidden }`, and `.view` is an ancestor of
the filter bar.

That rule existed to hide the sideways scrolling from CC-03. So one bad fix
papered over a symptom and broke something else doing it.

**Fix:** Removed it, and left a comment saying why so it doesn't come back.
Since CC-03 is fixed properly now, there's nothing left for it to hide.

**Worth saying:** the order mattered. Fixing CC-05 on its own would have
brought the sideways scrolling straight back.

---

## CC-06 — Ordering more than they had

**Reproduced:** A dish with 2 left accepted an order for 5, and the order went
through.

**Cause:** The line check only asked whether *any* stock existed:

```js
else if (Number(dish.stock) <= 0) errors.push(`${dish.name} is sold out`);
```

Nothing ever compared the quantity being ordered against the quantity
available. So 2 in stock passes the check no matter what you ask for.

**Fix:** One more branch, comparing quantity to stock:

```js
else if (qty > Number(dish.stock)) errors.push(`${dish.name}: only ${dish.stock} left`);
```

**Checked:** 5 of a 2-stock dish is refused with a message saying how many are
left; ordering exactly 2 still works; genuinely sold-out dishes are still
refused by the existing check.

---

## CC-07 — Cancelling made it worse

**Reproduced:** Cancelled an order and the stock went *down* instead of back
up. Doing it a few times drives the count toward zero while the kitchen is
full.

**Cause:** A sign. `releaseStock` is meant to put plates back, but it subtracts
them:

```js
return { ...dish, stock: dish.stock - line.qty };
```

That's the same line as the reserve path. It reads as a copy-paste where the
operator never got flipped.

**Fix:** `+` instead of `-`.

**Checked:** Cancelling 2 against a stock of 3 gives 5. Reserving and then
releasing the same order returns to the original number, which is the property
that actually matters. Dishes not in the order are untouched.

---

## CC-08 — Expired coupon still worked

**Reproduced:** `FRESHERS24` expired in September 2024 and still applied its
discount.

**Cause:** There are two code paths for coupons and only one of them checks the
date. The endpoint that *lists* coupons filters out expired ones, so the
expired coupon correctly never shows up in the UI — but the function that
*applies* a coupon only checked `usesLeft`, never `expiresAt`. Typing the code
in by hand skipped the only check there was.

This is a good reminder that hiding something in the interface isn't the same
as enforcing it.

**Fix:** An expiry check in `applyCoupon`, before the uses check.

**Checked:** The expired code is refused with a message saying so, including
with odd casing and spacing. A live coupon still discounts normally, and the
expired one still validates if you pretend the date is back in 2024 — which
shows I rejected it for being expired and not for some other reason.

---

## CC-09 — Menu showed more dishes than it should

**Reproduced:** Asked the API for one page of 5 and got all 37 back. The page
header says it too: "requested page size 5 · total 37".

**Cause:** `paginate()` does the slicing correctly and then throws it away:

```js
const items = list.slice(start, start + perPage);
return { items: list, ... };   // slices, then returns the whole list
```

Everything else — page, total, pages, hasMore — was right, which is why "load
more" still behaved. Only the array was wrong.

**Fix:** Return `items` instead of `list`.

**Checked:** 5 comes back when 5 is asked for. Page 2 returns the *next* five
rather than the first five again, the last page returns only what's left, and
walking every page returns each dish exactly once.

---

## CC-10 — Price sorting backwards

**Reproduced:** Picked "price: low to high" and got the most expensive first.
The other option was wrong too.

**Cause:** The two comparators are swapped:

```js
'price-asc':  (a, b) => b.price - a.price,   // descending
'price-desc': (a, b) => a.price - b.price,   // ascending
```

Both being wrong is the clue — a single flipped comparator would only break one
direction.

**Fix:** Swapped them back.

**Checked:** Low-to-high now starts at the cheapest. The test also asserts the
two are exact reverses of each other, and that the other sort options are
unaffected.

---

## Extra credit

### Tests

Two plain Node scripts, no test runner or dependency:

```
node backend/search.test.js    sorting and pagination   (11 cases)
node backend/orders.test.js    stock and coupons        (12 cases)
```

They fail before the fixes and pass after. Some of them exist to catch a
careless fix rather than the original bug — that sorting doesn't modify the
list it was given, that pagination covers every dish exactly once, that
reserving and then releasing stock returns to where it started, and that an
expired coupon was rejected for being expired and not by accident.

### Search asked the server on every keystroke

**How I noticed:** while checking CC-01 I watched the network and saw a request
go out for every single character typed.

**Why it matters:** it's wasted load, and a single letter is worse than
useless here — the tokeniser drops one-character words, so the search ends up
with no terms, treats that as "no search", and returns the entire menu. Typing
one letter quietly showed everything.

**Change:** search and suggestions now share a minimum of 2 characters and wait
800ms after you stop typing. Clearing the box is still honoured, so the full
menu comes back. Since the request is now a beat behind the typing, the
dropdown shows "Searching…" straight away so the pause doesn't look broken.

**Unsure about:** 800ms is a guess at "deliberate but not sluggish". Both the
delay and the minimum are named constants, so they're one edit each.

### Something I chose not to change

The tokeniser dropping single characters is arguably its own bug — you can't
search for "7", or a one-letter name. I left it, because raising the search
minimum to two characters makes it unreachable from the UI anyway, and widening
the tokeniser would change the ranking of every other search. That felt like a
decision for whoever owns the search behaviour rather than something to quietly
change while fixing other things.
