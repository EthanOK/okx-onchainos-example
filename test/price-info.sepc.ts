import test from "node:test";

import { getTokenPriceInfo } from "../src/GetTokenPriceInfo.ts";
import { assert } from "node:console";

test("getTokenPriceInfo:", async () => {
  // GOLD
  const XAUT = "0x68749665FF8D2d112Fa859AA293F07A622782F38";
  const PAXG = "0x45804880de22913dafe09f4980848ece6ecbaf78";

  // STOCKS
  const CRCLon = "0x3632dea96a953c11dac2f00b4a05a32cd1063fae";
  const COINon = "0xf042cfa86cf1d598a75bdb55c3507a1f39f9493b";
  const NVDAon = "0x2d1f7226bd1f780af6b9a49dcc0ae00e8df4bdee";
  const GOOGLon = "0xba47214edd2bb43099611b208f75e4b42fdcfedc";
  const AAPLon = "0x14c3abf95cb9c93a8b82c1cdcb76d72cb87b2d4c";
  const METAon = "0x59644165402b611b350645555b50afb581c71eb2";
  const TSLAon = "0xf6b1117ec07684d3958cad8beb1b302bfd21103f";
  const AMZNon = "0xbb8774fb97436d23d74c1b882e8e9a69322cfd31";
  const MSFTon = "0xb812837b81a3a6b81d7cd74cfb19a7f2784555e5";
  const SLVon = "0xf3e4872e6a4cf365888d93b6146a2baa7348f1a4";

  const tokenAddresses = [
    XAUT,
    PAXG,
    CRCLon,
    COINon,
    NVDAon,
    GOOGLon,
    AAPLon,
    METAon,
    TSLAon,
    AMZNon,
    MSFTon,
    SLVon,
  ];

  const data = await getTokenPriceInfo({
    chainIndex: "1",
    tokenContractAddress: tokenAddresses,
  });
  console.log(data);
  assert(data.length == tokenAddresses.length);
});

// node --test test/price-info.sepc.ts
