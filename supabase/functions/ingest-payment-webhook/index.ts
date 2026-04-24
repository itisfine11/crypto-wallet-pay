import { createClient } from "jsr:@supabase/supabase-js@2";

const MERCHANT_WALLET = "0x1Cc448AF59bfdB32aC79E6E40a4CEdC59D29a01D".toLowerCase();
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const CONFIRMATIONS_REQUIRED = 12;

const TOKENS_BY_CONTRACT: Record<string, { coin: string; decimals: number }> = {
  "0x55d398326f99059ff775485246999027b3197955": { coin: "USDT", decimals: 18 },
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": { coin: "USDC", decimals: 18 },
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

function hexToBigInt(hexValue: string): bigint {
  if (!hexValue || !hexValue.startsWith("0x")) throw new Error("Invalid hex value");
  return BigInt(hexValue);
}

function topicToAddress(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
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
    throw new Error(`${method} failed: ${json.error.message ?? "Unknown RPC error"}`);
  }
  return json.result as T;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
    if (!webhookSecret) {
      throw new Error("WEBHOOK_SECRET not set");
    }

    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const headerSecret = req.headers.get("x-webhook-secret");
    if (bearer !== webhookSecret && headerSecret !== webhookSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const txHash = String(body?.txHash ?? body?.hash ?? body?.transactionHash ?? "").toLowerCase();
    if (!/^0x([a-fA-F0-9]{64})$/.test(txHash)) {
      return new Response(JSON.stringify({ error: "txHash is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const rpcUrl = Deno.env.get("BSC_RPC_URL") ?? "https://bsc-dataseed.binance.org";
    const receipt = await rpcCall<{
      blockNumber: string | null;
      transactionHash: string;
      logs: Array<{ address: string; topics: string[]; data: string }>;
    }>(rpcUrl, "eth_getTransactionReceipt", [txHash]);

    if (!receipt || !receipt.blockNumber) {
      return new Response(JSON.stringify({ status: "pending", txHash }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    }

    const matchingLog = receipt.logs.find((log) => {
      const token = TOKENS_BY_CONTRACT[log.address.toLowerCase()];
      if (!token) return false;
      if (!Array.isArray(log.topics) || log.topics.length < 3) return false;
      if ((log.topics[0] ?? "").toLowerCase() !== TRANSFER_TOPIC) return false;
      const to = topicToAddress(log.topics[2]);
      return to === MERCHANT_WALLET;
    });

    if (!matchingLog) {
      return new Response(JSON.stringify({ status: "ignored", reason: "No relevant transfer log", txHash }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const tokenMeta = TOKENS_BY_CONTRACT[matchingLog.address.toLowerCase()];
    const transferValueRaw = hexToBigInt(matchingLog.data);

    const block = await rpcCall<{ timestamp: string }>(rpcUrl, "eth_getBlockByNumber", [
      receipt.blockNumber,
      false,
    ]);
    const currentBlockHex = await rpcCall<string>(rpcUrl, "eth_blockNumber", []);

    const txBlock = hexToBigInt(receipt.blockNumber);
    const currentBlock = hexToBigInt(currentBlockHex);
    const confirmations = Number(currentBlock - txBlock + 1n);

    const txTimestamp = Number(hexToBigInt(block.timestamp));
    const txTimestampIso = new Date(txTimestamp * 1000).toISOString();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: orders, error: ordersErr } = await supabase
      .from("orders")
      .select("id, order_number, amount_due, status, tx_hash, created_at")
      .eq("network", "BSC (BEP20)")
      .eq("coin", tokenMeta.coin)
      .in("status", ["Pending", "Process"])
      .gt("expires_at", new Date().toISOString())
      .lte("created_at", txTimestampIso);

    if (ordersErr) throw ordersErr;

    const existingOrderForTx = (orders ?? []).find((order) => order.tx_hash === txHash);
    const candidateOrders = existingOrderForTx
      ? [existingOrderForTx]
      : (orders ?? [])
          .filter((order) => !order.tx_hash)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const matchedOrder = candidateOrders.find((order) => {
      try {
        return decimalToRawUnits(order.amount_due, tokenMeta.decimals) === transferValueRaw;
      } catch {
        return false;
      }
    });

    if (!matchedOrder) {
      return new Response(
        JSON.stringify({
          status: "unmatched",
          txHash,
          coin: tokenMeta.coin,
          confirmations,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const newStatus = confirmations >= CONFIRMATIONS_REQUIRED ? "Paid" : "Process";
    if (matchedOrder.status !== newStatus || matchedOrder.tx_hash !== txHash) {
      const { error: updErr } = await supabase
        .from("orders")
        .update({
          status: newStatus,
          tx_hash: txHash,
          confirmations,
        })
        .eq("id", matchedOrder.id);

      if (updErr) throw updErr;
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        txHash,
        orderId: matchedOrder.id,
        orderNumber: matchedOrder.order_number,
        orderStatus: newStatus,
        confirmations,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("ingest-payment-webhook error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
