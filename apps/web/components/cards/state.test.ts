import { describe, expect, it } from "vitest";
import { decodeState, defaultState, encodeState, PRESETS } from "./state";

const roundTrip = (s: ReturnType<typeof defaultState>) => decodeState(new URLSearchParams(encodeState(s)));

describe("cards URL state", () => {
  it("omits defaults entirely", () => {
    expect(encodeState(defaultState())).toBe("");
    expect(decodeState(new URLSearchParams(""))).toEqual(defaultState());
  });

  it("round-trips every field", () => {
    const s = defaultState();
    s.cardIds = ["amex-platinum", "citi-double-cash", "chase-sapphire-reserve"];
    s.spend = { ...PRESETS[2]!.spend, dining: 1234_50, gas: 0 };
    s.centsPerPoint = { "chase-ur": 1.5, "amex-mr": 0.8 };
    s.creditPercent = { "plat-airline-credit": 100, "csr-dining-credit": 40 };
    s.view = "first_year";
    expect(roundTrip(s)).toEqual(s);
  });

  it("round-trips an empty selection and ignores never-used credits", () => {
    const s = { ...defaultState(), cardIds: [], creditPercent: { a: 0 } };
    expect(roundTrip(s)).toEqual({ ...s, creditPercent: {} });
  });

  it("drops unknown cards, duplicates, and garbage values", () => {
    const p = new URLSearchParams("c=a,a,zzz,b,c,d,e&s=dining:abc,bogus:5,gas:-3&v=x:0&u=y:250");
    const s = decodeState(p, new Set(["a", "b", "c", "d", "e"]));
    expect(s.cardIds).toEqual(["a", "b", "c", "d"]);
    expect(s.spend).toEqual(defaultState().spend);
    expect(s.centsPerPoint).toEqual({});
    expect(s.creditPercent).toEqual({ y: 100 });
  });
});
