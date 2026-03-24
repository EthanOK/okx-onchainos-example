import {
  buildCurlCommand,
  mustEnv,
  signOkxRequest,
  OKX_PRICE_INFO_PATH,
  OKX_BASE_URL,
} from "./Utils.ts";
import type { OkxDexTokenPriceInfo, OkxEnvelope } from "./Utils.ts";

/**
 * 获取 Token 增强价格信息（返回 OKX 响应的 data 字段）
 *
 * 环境变量（必填）：
 * - OKX_API_KEY
 * - OKX_SECRET_KEY
 * - OKX_PASSPHRASE
 */
export async function getTokenPriceInfo(params: {
  chainIndex: string;
  tokenContractAddress: string[];
  timeoutMs?: number;
}): Promise<OkxDexTokenPriceInfo[]> {
  const apiKey = mustEnv("OKX_API_KEY");
  const secretKey = mustEnv("OKX_SECRET_KEY");
  const passphrase = mustEnv("OKX_PASSPHRASE");

  const addresses = params.tokenContractAddress
    .map((s) => s.trim())
    .filter(Boolean);
  if (addresses.length === 0) {
    throw new Error("tokenContractAddress is required");
  }
  if (addresses.length > 100) {
    throw new Error("tokenContractAddress supports up to 100 addresses");
  }

  const bodyObj = addresses.map((tokenContractAddress) => ({
    chainIndex: String(params.chainIndex),
    tokenContractAddress,
  }));
  const body = JSON.stringify(bodyObj);
  const timestamp = new Date().toISOString();
  const sign = signOkxRequest({
    timestamp,
    method: "POST",
    requestPath: OKX_PRICE_INFO_PATH,
    body,
    secretKey,
  });

  const controller = new AbortController();
  const timeoutMs = params.timeoutMs ?? 10_000;
  const t = setTimeout(() => controller.abort(), timeoutMs);

  const headers = {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "Content-Type": "application/json",
  };

  if (process.env.OKX_LOG_CURL === "1") {
    const url = `${OKX_BASE_URL}${OKX_PRICE_INFO_PATH}`;
    console.log(
      buildCurlCommand({
        url,
        method: "POST",
        headers,
        body,
      }),
    );
  }

  try {
    const res = await fetch(`${OKX_BASE_URL}${OKX_PRICE_INFO_PATH}`, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    const json = (await res.json()) as OkxEnvelope<OkxDexTokenPriceInfo[]>;
    if (json.code !== "0") {
      throw new Error(`OKX API error: code=${json.code} msg=${json.msg || ""}`);
    }
    return json.data;
  } finally {
    clearTimeout(t);
  }
}
