export const formatTs = (ts: string) => {
  const n = Number(ts);
  if (!Number.isFinite(n)) return `invalid ts=${ts}`;
  const utc = new Date(n).toISOString();
  return `${utc} UTC`;
};

export const SYMBOL_TO_ADDRESS = {
  // GOLD
  XAUT: "0x68749665FF8D2d112Fa859AA293F07A622782F38",
  PAXG: "0x45804880de22913dafe09f4980848ece6ecbaf78",

  // STOCKS
  CRCLon: "0x3632dea96a953c11dac2f00b4a05a32cd1063fae",
  COINon: "0xf042cfa86cf1d598a75bdb55c3507a1f39f9493b",
  NVDAon: "0x2d1f7226bd1f780af6b9a49dcc0ae00e8df4bdee",
  GOOGLon: "0xba47214edd2bb43099611b208f75e4b42fdcfedc",
  AAPLon: "0x14c3abf95cb9c93a8b82c1cdcb76d72cb87b2d4c",
  METAon: "0x59644165402b611b350645555b50afb581c71eb2",
  TSLAon: "0xf6b1117ec07684d3958cad8beb1b302bfd21103f",
  AMZNon: "0xbb8774fb97436d23d74c1b882e8e9a69322cfd31",
  MSFTon: "0xb812837b81a3a6b81d7cd74cfb19a7f2784555e5",
  SLVon: "0xf3e4872e6a4cf365888d93b6146a2baa7348f1a4",
} as const;

export type BricSwapSymbol = keyof typeof SYMBOL_TO_ADDRESS;

export const getBricSwapTokenAddresses = () => {
  return Object.values(SYMBOL_TO_ADDRESS);
};

// getSymbolFromAddress
export const getSymbolFromAddress = (address: string): string | undefined => {
  const key = address.toLowerCase();
  return ADDRESS_TO_SYMBOL[key];
};

const ADDRESS_TO_SYMBOL: Partial<Record<string, BricSwapSymbol>> = (() => {
  const out: Partial<Record<string, BricSwapSymbol>> = Object.create(null);
  for (const [symbol, addr] of Object.entries(SYMBOL_TO_ADDRESS)) {
    out[addr.toLowerCase()] = symbol as BricSwapSymbol;
  }
  return out;
})();
