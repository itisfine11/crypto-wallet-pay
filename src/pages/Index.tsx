import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wallet, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentModal } from "@/components/PaymentModal";
import { generateOrder, WALLETS, DEMO_ADDRESS, type Coin, type Network } from "@/lib/payment-data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Index = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const order = useMemo(() => generateOrder(), []);

  const handleProceed = async (coin: Coin, network: Network) => {
    setCreating(true);
    const depositAddress = WALLETS[network] ?? DEMO_ADDRESS;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("orders")
      .insert({
        order_number: order.orderNumber,
        merchant: order.merchant,
        coin,
        network,
        deposit_address: depositAddress,
        subtotal: order.subtotal,
        fee: order.fee,
        amount_due: order.amountDue,
        expires_at: expiresAt,
      })
      .select()
      .single();

    setCreating(false);

    if (error || !data) {
      toast.error("Failed to create order", { description: error?.message });
      return;
    }

    setOpen(false);
    navigate("/deposit", {
      state: {
        coin,
        network,
        order: { ...order, id: data.id },
        depositAddress,
      },
    });
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center animate-fade-in">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-primary shadow-glow mb-6">
          <Wallet className="h-8 w-8 text-primary-foreground" />
        </div>

        <h1 className="text-4xl font-bold tracking-tight mb-3">
          Crypto Payment <span className="bg-gradient-primary bg-clip-text text-transparent">Tracker</span>
        </h1>
        <p className="text-muted-foreground mb-8">
          Securely pay your order with USDT or USDC across major networks.
        </p>

        <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card mb-6 text-left">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Amount Due</p>
          <p className="text-4xl font-bold text-primary">${order.amountDue.toFixed(6)}</p>
          <p className="text-xs text-muted-foreground mt-1">Order {order.orderNumber}</p>
        </div>

        <Button
          size="lg"
          onClick={() => setOpen(true)}
          className="w-full bg-gradient-primary text-primary-foreground font-semibold text-base hover:opacity-90 shadow-glow"
        >
          Pay Now
        </Button>

        <div className="grid grid-cols-2 gap-3 mt-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 rounded-xl bg-secondary/40 border border-border">
            <ShieldCheck className="h-4 w-4 text-primary" /> Secure escrow
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 rounded-xl bg-secondary/40 border border-border">
            <Zap className="h-4 w-4 text-accent" /> Fast settlement
          </div>
        </div>
      </div>

      <PaymentModal
        open={open}
        onOpenChange={(v) => !creating && setOpen(v)}
        order={order}
        onProceed={handleProceed}
      />
    </main>
  );
};

export default Index;
