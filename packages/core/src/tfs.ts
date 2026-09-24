export interface TfsInput {
  date: string;
  origins: readonly string[];
  destinations: readonly string[];
}

const varint = (value: number | bigint): number[] => {
  const out: number[] = [];
  let rest = BigInt(value);
  do {
    let byte = Number(rest & 0x7fn);
    rest >>= 7n;
    if (rest > 0n) byte |= 0x80;
    out.push(byte);
  } while (rest > 0n);
  return out;
};

const key = (field: number, wire: 0 | 2) => varint((field << 3) | wire);
const int = (field: number, value: number | bigint) => [...key(field, 0), ...varint(value)];
const bytes = (field: number, payload: number[]) => [...key(field, 2), ...varint(payload.length), ...payload];
const ascii = (field: number, text: string) => bytes(field, [...text].map((char) => char.charCodeAt(0)));
const airport = (field: number, code: string) => bytes(field, [...int(1, 1), ...ascii(2, code)]);
const NO_PRICE_LIMIT = 0xffff_ffff_ffff_ffffn;

/** Google Flights `tfs` parameter for a one-way, 1-adult, economy search (structure observed 2026-09-24). */
export function buildTfs({ date, origins, destinations }: TfsInput): string {
  const leg = [
    ...ascii(2, date),
    ...origins.flatMap((code) => airport(13, code)),
    ...destinations.flatMap((code) => airport(14, code)),
  ];
  const message = [
    ...int(1, 28),
    ...int(2, 2),
    ...bytes(3, leg),
    ...int(8, 1),
    ...int(9, 1),
    ...int(14, 1),
    ...bytes(16, int(1, NO_PRICE_LIMIT)),
    ...int(19, 2),
  ];
  return btoa(String.fromCharCode(...message)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function searchUrl(input: TfsInput): string {
  return `https://www.google.com/travel/flights/search?tfs=${buildTfs(input)}&hl=en&curr=EUR`;
}
