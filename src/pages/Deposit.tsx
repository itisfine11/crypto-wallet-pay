import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { QRCodeImage } from "@/components/QRCodeImage";
import { ArrowLeft, Copy, Check, Clock, Info, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { CoinNetworkIcon } from "@/components/CoinIcon";
import { DEMO_ADDRESS, type Coin, type Network, type OrderInfo, COINS } from "@/lib/payment-data";

const DEADLINE_SECONDS = 10 * 60;

const Row = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
  <div className="flex justify-between items-center py-2 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className={accent ? "font-bold text-primary text-base" : "font-medium text-foreground"}>{value}</span>
  </div>
);

const Deposit = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { coin: Coin; network: Network; order: OrderInfo } | null;

  useEffect(() => {
    if (!state) navigate("/", { replace: true });
  }, [state, navigate]);

  const [ack1, setAck1] = useState(false);
  const [ack2, setAck2] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(DEADLINE_SECONDS);
  const [copied, setCopied] = useState(false);

  const acknowledged = ack1 && ack2;

  useEffect(() => {
    if (!acknowledged) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          toast.error("Order expired", { description: "Redirecting back to start." });
          setTimeout(() => navigate("/", { replace: true }), 800);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [acknowledged, navigate]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  const coinName = useMemo(() => {
    if (!state) return "";
    return COINS.find((c) => c.id === state.coin)?.name ?? state.coin;
  }, [state]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(DEMO_ADDRESS);
    setCopied(true);
    toast.success("Address copied");
    setTimeout(() => setCopied(false), 1800);
  };

  if (!state) return null;
  const { coin, network, order } = state;

  return (
    <main className="min-h-screen px-4 py-6 max-w-xl mx-auto animate-fade-in">
      <header className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="h-10 w-10 rounded-full border border-border bg-secondary/60 hover:bg-secondary flex items-center justify-center transition"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">Deposit Payment</h1>
      </header>

      <section className="bg-gradient-card border border-border rounded-2xl p-5 shadow-card mb-5">
        <div className="flex items-center gap-3">
          <CoinNetworkIcon coin={coin} network={network} />
          <div>
            <p className="font-semibold">{coin} · {network}</p>
            <p className="text-xs text-muted-foreground">{coinName}</p>
          </div>
        </div>
      </section>

      {!acknowledged && (
        <section className="bg-gradient-card border border-border rounded-2xl p-5 shadow-card mb-5 space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Please confirm
          </h2>

          {[
            "I understand that if I deposit funds on the incorrect network address it may lead to a permanent loss of funds.",
            "I understand that this deposit address is unique to this order and will not be valid once the order is expired, canceled, or paid in full. Any funds sent to this address afterward may be permanently lost.",
          ].map((text, i) => {
            const checked = i === 0 ? ack1 : ack2;
            const setter = i === 0 ? setAck1 : setAck2;
            return (
              <label
                key={i}
                className="flex gap-3 items-start p-3 rounded-xl border border-border bg-secondary/40 cursor-pointer hover:border-primary/40 transition"
              >
                <Checkbox checked={checked} onCheckedChange={(v) => setter(!!v)} className="mt-0.5" />
                <span className="text-sm leading-relaxed text-muted-foreground">{text}</span>
              </label>
            );
          })}
        </section>
      )}

      {acknowledged && (
        <>
          <section className="bg-gradient-card border border-border rounded-2xl p-5 shadow-card mb-5 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Deposit to this address</h2>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-warning/10 border border-warning/30">
                <Clock className="h-3.5 w-3.5 text-warning animate-pulse-glow" />
                <span className="font-mono text-sm font-bold text-warning">{mm}:{ss}</span>
              </div>
            </div>

            <div className="flex justify-center mb-4">
              <div className="p-4 bg-white rounded-2xl shadow-glow">
                <QRCodeImage value={DEMO_ADDRESS} size={180} />
              </div>
            </div>

            <div className="rounded-xl bg-secondary/60 border border-border p-3 flex items-center gap-2">
              <p className="font-mono text-xs break-all flex-1 text-foreground/90">{DEMO_ADDRESS}</p>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCopy}
                className="shrink-0 hover:bg-primary/20 hover:text-primary"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </section>

          <section className="bg-secondary/40 border border-border rounded-2xl p-4 mb-5 text-xs leading-relaxed text-muted-foreground space-y-2">
            <div className="flex gap-2">
              <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p>
                This deposit address is a Contract Address, and it is safe to send funds to this address. It can only
                receive <span className="text-foreground font-semibold">{coinName} ({coin})</span> on the{" "}
                <span className="text-foreground font-semibold">{network}</span> network.
              </p>
            </div>
            <p className="pl-6">Funds sent to an incorrect address or network are not recoverable.</p>
            <p className="pl-6">
              The deposit amount needs to be{" "}
              <span className="text-primary font-bold">${order.amountDue.toFixed(2)}</span>, otherwise your order will not
              be processed.
            </p>
          </section>
        </>
      )}

      <section className="bg-gradient-card border border-border rounded-2xl p-5 shadow-card">
        <h2 className="font-semibold mb-2">Order Details</h2>
        <div className="divide-y divide-border">
          <Row label="Order Number" value={order.orderNumber} />
          <Row label="Merchant" value={order.merchant} />
          <Row label="Status" value={order.status} />
          <Row label="Subtotal" value={`$${order.subtotal.toFixed(2)}`} />
          <Row label="Fee" value={`$${order.fee.toFixed(2)}`} />
          <Row label="Amount Due" value={`$${order.amountDue.toFixed(2)}`} accent />
        </div>
      </section>
    </main>
  );
};

export default Deposit;
