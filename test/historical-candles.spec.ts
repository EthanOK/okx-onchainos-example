import test from "node:test";
import { getHistoryCandles } from "../src/GetHistoryCandles.ts";
import { formatTs } from "./utils.ts";

test("getHistoryCandles:", async () => {

  const historyCandles = await getHistoryCandles({
    chainIndex: "1",
    tokenContractAddress: "0x45804880de22913dafe09f4980848ece6ecbaf78",
    after: "1693699200000",
    bar: "1Dutc",
    limit: "300", // default is 100
  });
  // console.log(historyCandles);
  console.log("historyCandles.length:", historyCandles.length);
  const firstCandle = historyCandles[0];
  const lastCandle = historyCandles[historyCandles.length - 1];
  if (firstCandle.ts > lastCandle.ts) {
    console.log(formatTs(lastCandle.ts), "->", formatTs(firstCandle.ts));
  } else {
    console.log(formatTs(firstCandle.ts), "->", formatTs(lastCandle.ts));
  }
});
// node --test test/historical-candles.spec.ts
