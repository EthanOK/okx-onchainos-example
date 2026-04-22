import test from "node:test";
import { getHistoryCandles } from "../src/GetHistoryCandles.ts";

test("getHistoryCandles:", async () => {
  const historyCandles = await getHistoryCandles({
    chainIndex: "1",
    tokenContractAddress: "0x45804880de22913dafe09f4980848ece6ecbaf78",
    // after: "1733702400000",
    bar: "1Dutc",
    // limit: "300", // default is 100
  });
  console.log(historyCandles);
  console.log(historyCandles.length);
});
// node --test test/historical-candles.spec.ts
