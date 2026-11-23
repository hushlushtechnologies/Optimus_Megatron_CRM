import { addFils, filsToDecimalString, formatFils, toFils, type Fils } from "@/src/lib/utils/sales-money";

/*
|--------------------------------------------------------------------------
| MONEY IN REPORTS
|--------------------------------------------------------------------------
|
| Reports add money up. This file is how they do it exactly.
|
| WHAT WAS HAPPENING
|
| The Sprint 6 report read every amount as a JavaScript number and summed
| them:
|
|     const num = (v) => Number(v);
|     completedRows.reduce((sum, row) => sum + num(row.total_due), 0)
|
| and then handed the accumulated float to formatMoney(), which is
| formatFils(toFils(value)) — so the float was converted to fils only after
| the drift had already been baked in.
|
| At a dealership's scale that does not produce a visibly wrong total: AED
| values stay inside exact double range until about 9×10¹³. So this is not an
| urgent wrong number. It is the pattern the sprint plan forbids outright —
| "use precise currency arithmetic", "avoid floating-point accumulation
| errors" — in a module heading for production, and the right time to fix it
| is while the aggregation layer is being written anyway rather than after
| eleven report domains have copied it.
|
| HOW THIS IS EXACT
|
| Everything accumulates in `bigint` fils, which cannot drift. The conversion
| from the database's `numeric` happens once per value, through toFils(),
| which parses the decimal string digit by digit rather than going via a
| float.
|
| WHY FILS CROSS THE WIRE AS A STRING
|
| A bigint cannot be serialised into a React Server Component payload — it
| throws rather than degrading. So a Money value carries its fils as a decimal
| string, which is exact, plus a preformatted display string, plus a plain
| number for chart geometry only.
|
| The number is there because Recharts needs one to decide how tall a bar is,
| and a bar's height does not need to be exact to the fil. It is named `chart`
| rather than `value` or `amount` so that reaching for it to display money
| reads as obviously wrong.
*/

/**
 * A money figure ready to cross from the server to the client.
 *
 * `fils` is the authority. `display` is what a person reads. `chart` is for
 * geometry and nothing else.
 */
export interface Money {
  /** Exact, as a decimal string of whole fils. e.g. "123450" */
  fils: string;
  /** Preformatted with the currency. e.g. "AED 1,234.50" */
  display: string;
  /** Lossy. For chart axes and bar heights only — never for a displayed figure. */
  chart: number;
}

const ZERO: Fils = 0n;

/** A database money value as exact fils. Unparseable values are zero. */
export function filsOf(value: string | number | null | undefined): Fils {
  return toFils(value ?? null) ?? ZERO;
}

/**
 * Sum one money column across rows, exactly.
 *
 * Takes a picker rather than a key so a caller can sum something signed —
 * refunds counting negative, say — without a second function.
 */
export function sumFils<TRow>(
  rows: readonly TRow[],
  pick: (row: TRow) => string | number | null | undefined,
): Fils {
  let total = ZERO;
  for (const row of rows) total = addFils(total, filsOf(pick(row)));
  return total;
}

/** Package exact fils for the client. */
export function money(fils: Fils, currency = "AED"): Money {
  return {
    fils: fils.toString(),
    display: formatFils(fils, currency),
    chart: Number(filsToDecimalString(fils)),
  };
}

/** A zero that still carries the currency, for empty periods. */
export function zeroMoney(currency = "AED"): Money {
  return money(ZERO, currency);
}

/** Read a Money back as fils, for arithmetic on the client. */
export function moneyToFils(value: Money): Fils {
  try {
    return BigInt(value.fils);
  } catch {
    return ZERO;
  }
}

/*
|--------------------------------------------------------------------------
| THE TWO OPERATIONS THAT ARE NOT ADDITION
|--------------------------------------------------------------------------
*/

/**
 * An average, as money.
 *
 * Division is the one place money arithmetic has to round, so it happens
 * here, once, explicitly, rather than being left to a float somewhere in a
 * component. Rounds half-up on the fil, matching divRoundHalfUp in
 * sales-pricing.ts so the two money paths in this codebase agree.
 *
 * A count of zero is null, not zero: "no completed deals" and "an average of
 * nothing" are different statements and a card should be able to say so.
 */
export function averageFils(total: Fils, count: number): Fils | null {
  if (count <= 0) return null;

  const divisor = BigInt(count);
  const quotient = total / divisor;
  const remainder = total - quotient * divisor;

  /* Half-up, and symmetric for negatives so a net-outflow average rounds the
     same distance from zero as an inflow would. */
  const negative = total < ZERO;
  const twiceRemainder = (negative ? -remainder : remainder) * 2n;

  if (twiceRemainder >= divisor) {
    return negative ? quotient - 1n : quotient + 1n;
  }

  return quotient;
}

/**
 * A percentage of a money total, as a whole number.
 *
 * For "discount as a share of deal value" and the like. Returns null when the
 * base is zero rather than Infinity or NaN, so a card can say "not
 * applicable" instead of rendering a dash it cannot explain.
 */
export function percentOfFils(part: Fils, whole: Fils): number | null {
  if (whole === ZERO) return null;

  /* Scaled before dividing, so a small share of a large total does not floor
     to zero. */
  const scaled = (part * 10000n) / whole;
  return Number(scaled) / 100;
}

/*
|--------------------------------------------------------------------------
| SIGNED SUMS, FOR CASH MOVEMENT
|--------------------------------------------------------------------------
*/

export interface CashMovement {
  /** Verified money in. Never negative. */
  in: Money;
  /** Verified money out — refunds. Expressed positive. */
  out: Money;
  /** in − out. Can be negative, in a month of heavy refunds. */
  net: Money;
}

/**
 * Split verified payments into in, out and net.
 *
 * This exists because the Sprint 6 report collapsed all three into one figure
 * and labelled it "Collected":
 *
 *     collected = payments.reduce((sum, row) =>
 *       sum + (row.direction === "out" ? -amount : amount), 0)
 *
 * The sprint plan lists "Verified Payments Collected" and "Net Verified Cash
 * Movement" as two separate metrics and says never to combine concepts into
 * an ambiguous total. Under the old figure, a month that took AED 2m and
 * refunded AED 2m reported "Collected: 0", which is true of the net and false
 * of the collection.
 *
 * Returning all three means the UI can show whichever it means, and label it.
 */
export function splitCashMovement<TRow>(
  rows: readonly TRow[],
  pick: (row: TRow) => { amount: string | number | null; direction: string | null },
  currency = "AED",
): CashMovement {
  let inFils = ZERO;
  let outFils = ZERO;

  for (const row of rows) {
    const { amount, direction } = pick(row);
    const value = filsOf(amount);

    /*
     * Direction decides the bucket, and an unrecognised direction counts as
     * money in — because that is the conservative error for a *refund*
     * figure: it understates money returned rather than inventing it. The
     * column is constrained to 'in' and 'out' in the database, so this should
     * be unreachable.
     */
    if (direction === "out") {
      outFils = addFils(outFils, value);
    } else {
      inFils = addFils(inFils, value);
    }
  }

  return {
    in: money(inFils, currency),
    out: money(outFils, currency),
    net: money(inFils - outFils, currency),
  };
}
