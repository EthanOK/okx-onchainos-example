import test from "node:test";

import { getTokenPriceInfo } from "../src/GetTokenPriceInfo.ts";
import { assert } from "node:console";
import { getBricSwapTokenAddresses } from "./utils.ts";

test("getTokenPriceInfo:", async () => {
  const tokenAddresses = getBricSwapTokenAddresses();

  const data = await getTokenPriceInfo({
    chainIndex: "1",
    tokenContractAddress: tokenAddresses,
  });
  console.log(data);
  assert(data.length == tokenAddresses.length);
});

// node --test test/price-info.sepc.ts
