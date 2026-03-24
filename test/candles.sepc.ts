import test from "node:test";
import { getCandles } from "../src/GetCandles.ts";

test("getCandles:", async () => {
  const candles = await getCandles({
    chainIndex: "1",
    tokenContractAddress: "0x45804880de22913dafe09f4980848ece6ecbaf78",
  });
  console.log(candles);
});
// node --test test/candles.sepc.ts
