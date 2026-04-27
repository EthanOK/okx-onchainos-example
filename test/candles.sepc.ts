import test from "node:test";
import { getCandles } from "../src/GetCandles.ts";
import { formatTs } from "./utils.ts";

test("getCandles:", async () => {
  const candles = await getCandles({
    chainIndex: "1",
    tokenContractAddress: "0x45804880de22913dafe09f4980848ece6ecbaf78",
    bar: "5m",
    limit: "300",
  });
  // console.log(candles);
  console.log("candles.length:", candles.length);
  const firstCandle = candles[0];
  const lastCandle = candles[candles.length - 1];
  if (firstCandle.ts > lastCandle.ts) {
    console.log(formatTs(lastCandle.ts), "->", formatTs(firstCandle.ts));
  } else {
    console.log(formatTs(firstCandle.ts), "->", formatTs(lastCandle.ts));
  }
});
// node --test test/candles.sepc.ts
