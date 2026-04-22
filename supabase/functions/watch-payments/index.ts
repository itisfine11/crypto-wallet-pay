// Watches BSC for incoming USDT/USDC ERC-20 transfers to the merchant wallet
// and matches them to pending orders by exact amount.
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

type TokenTx = {
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenDecimal: string;
  contractAddress: string;
  blockNumber: string;
  confirmations: string;
  timeStamp: string;
};

async function fetchBscTransfers(apiKey: string, contract: string): Promise<TokenTx[]> {
  const url = new URL("https://api.bscscan.com/api");
  url.searchParams.set("module", "account");
  url.searchParams.set("action", "tokentx");
  url.searchParams.set("contractaddress", contract);
  url.searchParams.set("address", MERCHANT_WALLET);
  url.searchParams.set("page", "1");
  url.searchParams.set("offset", "50");
  url.searchParams.set("sort", "desc");
  url.searchParams.set("apikey", apiKey);

  const res = await fetch(url.toString());
  const json = await res.json();
  if (json.status !== "1") {
    if (json.message === "No transactions found") return [];
    console.warn("BscScan response:", json.message, json.result);
    return [];
  }
  return json.result as TokenTx[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("BSCSCAN_API_KEY");
    if (!apiKey) throw new Error("BSCSCAN_API_KEY not set");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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
    const coinsInUse = [...new Set(orders.map((o) => o.coin))];
    const transfersByCoin: Record<string, TokenTx[]> = {};
    for (const coin of coinsInUse) {
      const tok = TOKENS[coin];
      if (!tok) continue;
      transfersByCoin[coin] = await fetchBscTransfers(apiKey, tok.contract);
    }

    let updates = 0;

    for (const order of orders) {
      const tok = TOKENS[order.coin];
      if (!tok) continue;
      const transfers = transfersByCoin[order.coin] ?? [];

      // Find a transfer that matches: to merchant, amount == amount_due, after order created
      const orderCreatedTs = Math.floor(new Date(order.created_at).getTime() / 1000);
      const expectedRaw = BigInt(Math.round(Number(order.amount_due) * 10 ** tok.decimals));

      const match = transfers.find((tx) => {
        if (tx.to.toLowerCase() !== MERCHANT_WALLET) return false;
        if (Number(tx.timeStamp) < orderCreatedTs) return false;
        // exact amount match
        try {
          return BigInt(tx.value) === expectedRaw;
        } catch {
          return false;
        }
      });

      if (!match) continue;

      const confirmations = Number(match.confirmations);
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
        console.log(`Order ${order.order_number} → ${newStatus} (tx ${match.hash}, conf ${confirmations})`);
      }
    }

    // Expire stale orders
    await supabase
      .from("orders")
      .update({ status: "Expired" })
      .eq("status", "Pending")
      .lt("expires_at", new Date().toISOString());

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
