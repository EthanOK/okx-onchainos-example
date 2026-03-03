import test from "node:test";

import { getTokenPriceInfo } from "../src/GetTokenPriceInfo.ts";

test("getTokenPriceInfo:", async () => {
  const addr1 = "0x3632dea96a953c11dac2f00b4a05a32cd1063fae";
  const addr2 = "0xf042cfa86cf1d598a75bdb55c3507a1f39f9493b";

  const data = await getTokenPriceInfo({
    chainIndex: "1",
    tokenContractAddress: [addr1, addr2],
  });
  console.log(data);
});

// node --test test/price-info.sepc.ts
