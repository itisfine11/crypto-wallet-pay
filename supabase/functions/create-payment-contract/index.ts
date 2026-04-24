import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WALLETS: Record<string, string> = {
  "BSC (BEP20)": "0x1Cc448AF59bfdB32aC79E6E40a4CEdC59D29a01D",
};

const DEMO_ADDRESS = "0x1Cc448AF59bfdB32aC79E6E40a4CEdC59D29a01D";

type CreatePaymentContractBody = {
  coin?: string;
  network?: string;
  order?: {
    orderNumber?: string;
    merchant?: string;
    subtotal?: number;
    fee?: number;
    amountDue?: number;
  };
};

function badRequest(message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as CreatePaymentContractBody;
    const coin = body?.coin?.trim();
    const network = body?.network?.trim();
    const order = body?.order;

    if (!coin) return badRequest("coin is required");
    if (!network) return badRequest("network is required");
    if (!order?.orderNumber) return badRequest("order.orderNumber is required");
    if (typeof order?.subtotal !== "number") return badRequest("order.subtotal is required");
    if (typeof order?.fee !== "number") return badRequest("order.fee is required");
    if (typeof order?.amountDue !== "number") return badRequest("order.amountDue is required");

    const depositAddress = WALLETS[network] ?? DEMO_ADDRESS;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const paymentContractId = `pc_${crypto.randomUUID().replaceAll("-", "")}`;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let data:
      | {
          id: string;
          order_number: string;
          payment_contract_id?: string | null;
          deposit_address: string;
        }
      | null = null;
    let error: { message: string } | null = null;

    const insertBase = {
      order_number: order.orderNumber,
      merchant: order.merchant ?? "Lovable Crypto Store",
      coin,
      network,
      deposit_address: depositAddress,
      subtotal: order.subtotal,
      fee: order.fee,
      fee_value: order.fee,
      amount_due: order.amountDue,
      expires_at: expiresAt,
    };

    const primaryInsert = await supabase
      .from("orders")
      .insert({
        ...insertBase,
        payment_contract_id: paymentContractId,
        contract_created_at: new Date().toISOString(),
      })
      .select("id, order_number, payment_contract_id, deposit_address")
      .single();

    data = primaryInsert.data;
    error = primaryInsert.error as { message: string } | null;

    if (error?.message?.includes("payment_contract_id") || error?.message?.includes("contract_created_at")) {
      const fallbackInsert = await supabase
        .from("orders")
        .insert(insertBase)
        .select("id, order_number, deposit_address")
        .single();

      data = fallbackInsert.data
        ? {
            ...fallbackInsert.data,
            payment_contract_id: paymentContractId,
          }
        : null;
      error = fallbackInsert.error as { message: string } | null;
    }

    if (error || !data) {
      throw new Error(error?.message ?? "Could not create payment contract");
    }

    return new Response(
      JSON.stringify({
        orderId: data.id,
        orderNumber: data.order_number,
        paymentContractId: data.payment_contract_id,
        depositAddress: data.deposit_address,
        expiresAt,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
