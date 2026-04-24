// Watches BSC via RPC logs for incoming USDT/USDC ERC-20 transfers
// to the merchant wallet and matches them to pending orders by exact amount.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Merchant wallet (BSC)
const MERCHANT_WALLET = "0x1Cc448AF59bfdB32aC79E6E40a4CEdC59D29a01D".toLowerCase();

// BEP-20 token contracts on BSC
const TOKENS: Record<string, { contract: string; decimals: number }> = {
  USDT: { contract: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 }, // Binance-Peg USDT
  USDC: { contract: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 }, // Binance-Peg USDC
};

const CONFIRMATIONS_REQUIRED = 12;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
// Orders expire in 10m (~200 blocks on BSC); look back ~45m for clock skew and delayed tx.
const LOOKBACK_BLOCKS = 600n;
// Outer step for eth_getLogs; public BSC RPCs often reject wide ranges or large result sets (-32005).
const LOG_SCAN_STEP = 8n;
const MAX_LOG_BISECT_DEPTH = 64;

type TokenTx = {
  hash: string;
  blockNumber: bigint;
  timeStamp: number;
  value: string;
};

function decimalToRawUnits(amount: string | number, decimals: number): bigint {
  const amountStr = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(amountStr)) {
    throw new Error(`Invalid decimal amount: ${amountStr}`);
  }

  const [wholePart, fractionalPart = ""] = amountStr.split(".");
  const normalizedFraction = fractionalPart.padEnd(decimals, "0").slice(0, decimals);
  const combined = `${wholePart}${normalizedFraction}`.replace(/^0+/, "") || "0";
  return BigInt(combined);
}

function addressToTopic(address: string): string {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

function hexToBigInt(hexValue: string): bigint {
  return BigInt(hexValue);
}

function jsonRpcErrorText(err: unknown): string {
  if (err == null) return "";
  if (typeof err === "string") return err;
  if (typeof err !== "object") return String(err);
  const o = err as Record<string, unknown>;
  const code = o.code != null ? `code=${o.code}` : "";
  const msg = typeof o.message === "string" ? o.message : "";
  let data = "";
  if (typeof o.data === "string") data = o.data;
  else if (o.data != null && typeof o.data === "object") {
    try {
      data = JSON.stringify(o.data);
    } catch {
      data = String(o.data);
    }
  }
  return [code, msg, data].filter(Boolean).join(" ");
}

async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });
  const json = await response.json();
  if (json.error) {
    const detail = jsonRpcErrorText(json.error) || "Unknown RPC error";
    throw new Error(`${method} failed: ${detail}`);
  }
  return json.result as T;
}

type RpcLog = { transactionHash: string; blockNumber: string; data: string; removed?: boolean };

function isLogsLimitError(message: string): boolean {
  // Match text and common JSON-RPC codes providers use for getLogs throttling / size caps.
  return /limit|exceed|result size|too many|time[- ]?out|oversized|maximum|block range|query timeout|-32002|-32005|-32603/i.test(
    message
  );
}

/** Single eth_getLogs; on provider "limit" errors, bisect the block range and merge. */
async function getLogsBisect(
  rpcUrl: string,
  contract: string,
  fromBlock: bigint,
  toBlock: bigint,
  depth = 0
): Promise<RpcLog[]> {
  const filter = {
    fromBlock: `0x${fromBlock.toString(16)}`,
    toBlock: `0x${toBlock.toString(16)}`,
    address: contract,
    topics: [TRANSFER_TOPIC, null, addressToTopic(MERCHANT_WALLET)] as (string | null)[],
  };
  try {
    return await rpcCall<RpcLog[]>(rpcUrl, "eth_getLogs", [filter]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (depth >= MAX_LOG_BISECT_DEPTH) {
      throw new Error(
        `${msg} (bisect depth exceeded; set BSC_RPC_URL to a node with higher eth_getLogs limits)`
      );
    }
    if (fromBlock >= toBlock) {
      if (isLogsLimitError(msg)) {
        throw new Error(
          `${msg} (cannot split below one block; set ETHERSCAN_API_KEY (Etherscan API v2, chain 56) for explorer fallback, or use a premium BSC_RPC_URL)`
        );
      }
      throw e;
    }
    if (!isLogsLimitError(msg)) throw e;
    const mid = fromBlock + (toBlock - fromBlock) / 2n;
    const left = await getLogsBisect(rpcUrl, contract, fromBlock, mid, depth + 1);
    const right = await getLogsBisect(rpcUrl, contract, mid + 1n, toBlock, depth + 1);
    return [...left, ...right];
  }
}

function rawTokenAmountToLogDataHex(raw: bigint): string {
  return `0x${raw.toString(16).padStart(64, "0")}`;
}

// BSC on Etherscan multichain API v2 (replaces deprecated api.bscscan.com/v1).
const ETHERSCAN_V2_API = "https://api.etherscan.io/v2/api";
const BSC_CHAIN_ID = "56";

/** Paginated account tokentx via Etherscan API v2 — avoids eth_getLogs -32005 on public RPCs. */
async function fetchBscTransfersViaEtherscanV2(
  apiKey: string,
  contract: string,
  fromBlock: bigint,
  toBlock: bigint
): Promise<TokenTx[]> {
  const transfers: TokenTx[] = [];
  const offset = 1000;
  let page = 1;

  while (true) {
    const params = new URLSearchParams({
      chainid: BSC_CHAIN_ID,
      module: "account",
      action: "tokentx",
      address: MERCHANT_WALLET,
      contractaddress: contract.toLowerCase(),
      page: String(page),
      offset: String(offset),
      startblock: fromBlock.toString(),
      endblock: toBlock.toString(),
      sort: "asc",
      apikey: apiKey,
    });
    const res = await fetch(`${ETHERSCAN_V2_API}?${params}`);
    const data = (await res.json()) as {
      status: string;
      message: string;
      result: unknown;
    };

    if (data.status !== "1" && String(data.status) !== "1") {
      const r = data.result;
      if (r === "No transactions found" || data.message === "No transactions found") break;
      throw new Error(`Etherscan v2 tokentx: ${data.message} ${typeof r === "string" ? r : ""}`.trim());
    }

    const rows = Array.isArray(data.result)
      ? (data.result as Array<{ blockNumber: string; timeStamp: string; hash: string; to: string; value: string }>)
      : [];
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!row?.hash || !row?.blockNumber || !row?.value) continue;
      if (row.to?.toLowerCase() !== MERCHANT_WALLET) continue;
      const raw = BigInt(row.value);
      transfers.push({
        hash: row.hash,
        blockNumber: BigInt(row.blockNumber),
        timeStamp: Number(row.timeStamp),
        value: rawTokenAmountToLogDataHex(raw),
      });
    }

    if (rows.length < offset) break;
    page++;
  }

  return transfers;
}

async function fetchBscTransfersViaRpcLogs(
  rpcUrl: string,
  contract: string,
  fromBlock: bigint,
  currentBlock: bigint
): Promise<TokenTx[]> {
  const blockTsCache = new Map<string, number>();
  const transfers: TokenTx[] = [];
  let chunkStart = fromBlock;

  while (chunkStart <= currentBlock) {
    const chunkEnd =
      chunkStart + LOG_SCAN_STEP - 1n <= currentBlock ? chunkStart + LOG_SCAN_STEP - 1n : currentBlock;

    const logs = await getLogsBisect(rpcUrl, contract, chunkStart, chunkEnd);

    for (const log of logs) {
      if (!log?.transactionHash || !log?.blockNumber || !log?.data || log.removed) continue;
      let blockTs = blockTsCache.get(log.blockNumber);
      if (typeof blockTs !== "number") {
        const block = await rpcCall<{ timestamp: string }>(rpcUrl, "eth_getBlockByNumber", [
          log.blockNumber,
          false,
        ]);
        blockTs = Number(hexToBigInt(block.timestamp));
        blockTsCache.set(log.blockNumber, blockTs);
      }

      transfers.push({
        hash: log.transactionHash,
        blockNumber: hexToBigInt(log.blockNumber),
        timeStamp: blockTs,
        value: log.data,
      });
    }

    chunkStart = chunkEnd + 1n;
  }

  return transfers;
}

async function fetchBscTransfers(
  rpcUrl: string,
  contract: string,
  currentBlock: bigint
): Promise<TokenTx[]> {
  const scanKey =
    Deno.env.get("ETHERSCAN_API_KEY")?.trim() ?? Deno.env.get("BSCSCAN_API_KEY")?.trim();
  const fromBlock = currentBlock > LOOKBACK_BLOCKS ? currentBlock - LOOKBACK_BLOCKS : 0n;

  // Etherscan API v2 (multichain) avoids eth_getLogs caps; use first when configured.
  if (scanKey) {
    try {
      return await fetchBscTransfersViaEtherscanV2(scanKey, contract, fromBlock, currentBlock);
    } catch (scanErr) {
      const reason = scanErr instanceof Error ? scanErr.message : String(scanErr);
      console.warn("Etherscan v2 tokentx failed, trying RPC logs:", reason);
    }
  }

  return await fetchBscTransfersViaRpcLogs(rpcUrl, contract, fromBlock, currentBlock);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const rpcUrl = Deno.env.get("BSC_RPC_URL") ?? "https://bsc-dataseed.binance.org";
    const currentBlockHex = await rpcCall<string>(rpcUrl, "eth_blockNumber", []);
    const currentBlock = hexToBigInt(currentBlockHex);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Expire stale pending orders first so frontend sees definitive state.
    await supabase
      .from("orders")
      .update({ status: "Expired" })
      .eq("status", "Pending")
      .lt("expires_at", new Date().toISOString());

    // Load active BSC orders
    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .eq("network", "BSC (BEP20)")
      .in("status", ["Pending", "Process"])
      .gt("expires_at", new Date().toISOString());

    if (error) throw error;
    console.log(`Checking ${orders?.length ?? 0} active BSC orders`);

    if (!orders || orders.length === 0) {
      return new Response(JSON.stringify({ checked: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch recent transfers per coin used by active orders
    const coinsInUse = [...new Set((orders as Array<{ coin: string }>).map((o) => o.coin))];
    const transfersByCoin: Record<string, TokenTx[]> = {};
    for (const coin of coinsInUse) {
      const tok = TOKENS[coin];
      if (!tok) continue;
      transfersByCoin[coin] = await fetchBscTransfers(rpcUrl, tok.contract, currentBlock);
    }

    let updates = 0;
    const claimedTxHashes = new Set(
      (orders as Array<{ tx_hash: string | null }>).flatMap((order) => (order.tx_hash ? [order.tx_hash] : []))
    );
    const sortedOrders = [...orders].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const latestBlockHex = await rpcCall<string>(rpcUrl, "eth_blockNumber", []);
    const latestBlock = hexToBigInt(latestBlockHex);

    for (const order of sortedOrders) {
      const tok = TOKENS[order.coin];
      if (!tok) continue;
      const transfers = transfersByCoin[order.coin] ?? [];

      // Find a transfer that matches: to merchant, amount == amount_due, after order created
      const orderCreatedTs = Math.floor(new Date(order.created_at).getTime() / 1000);
      let expectedRaw: bigint;
      try {
        expectedRaw = decimalToRawUnits(order.amount_due, tok.decimals);
      } catch (convErr) {
        console.error(`Failed to parse amount_due for order ${order.id}:`, convErr);
        continue;
      }

      const match = transfers.find((tx) => {
        if (tx.timeStamp < orderCreatedTs) return false;
        if (claimedTxHashes.has(tx.hash) && order.tx_hash !== tx.hash) return false;
        // exact amount match
        try {
          return hexToBigInt(tx.value) === expectedRaw;
        } catch {
          return false;
        }
      });

      if (!match) continue;

      const confirmations = Number(latestBlock - match.blockNumber + 1n);
      const newStatus = confirmations >= CONFIRMATIONS_REQUIRED ? "Paid" : "Process";

      if (order.status === newStatus && order.tx_hash === match.hash) continue;

      const { error: updErr } = await supabase
        .from("orders")
        .update({
          status: newStatus,
          tx_hash: match.hash,
          confirmations,
        })
        .eq("id", order.id);

      if (updErr) {
        console.error(`Failed to update order ${order.id}:`, updErr);
      } else {
        updates++;
        claimedTxHashes.add(match.hash);
        console.log(`Order ${order.order_number} → ${newStatus} (tx ${match.hash}, conf ${confirmations})`);
      }
    }

    return new Response(JSON.stringify({ checked: orders.length, updates }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("watch-payments error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
