import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { QRCodeImage } from "@/components/QRCodeImage";
import { ArrowLeft, Copy, Check, Clock, Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { CoinNetworkIcon } from "@/components/CoinIcon";
import { type Coin, type Network, type OrderInfo, type OrderStatus, COINS } from "@/lib/payment-data";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";

const DEADLINE_SECONDS = 10 * 60;

type DepositPageState = {
  coin: Coin;
  network: Network;
  order: OrderInfo;
  depositAddress: string;
  expiresAt?: string;
};

const normalizeOrderStatus = (raw: unknown): OrderStatus => {
  const normalized = String(raw ?? "").trim().toLowerCase();
  if (normalized === "process" || normalized === "processing") return "Process";
  if (normalized === "paid" || normalized === "success") return "Paid";
  if (normalized === "expired") return "Expired";
  return "Pending";
};

const Row = ({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) => (
  <div className="flex justify-between items-center py-2 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className={accent ? "font-bold text-primary text-base" : "font-medium text-foreground"}>{value}</span>
  </div>
);

const Deposit = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as DepositPageState | null;
  const orderIdFromQuery = useMemo(
    () => new URLSearchParams(location.search).get("orderId"),
    [location.search]
  );

  const [pageState, setPageState] = useState<DepositPageState | null>(state);
  const [loadingOrder, setLoadingOrder] = useState(!state);

  useEffect(() => {
    if (state) {
      setPageState(state);
      setLoadingOrder(false);
      return;
    }
    if (!orderIdFromQuery) {
      navigate("/", { replace: true });
      return;
    }

    let cancelled = false;
    setLoadingOrder(true);
    const bootstrapOrder = async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, merchant, coin, network, deposit_address, status, subtotal, fee, amount_due, expires_at, payment_contract_id, tx_hash, confirmations"
        )
        .eq("id", orderIdFromQuery)
        .single();

      if (cancelled) return;
      if (error || !data) {
        toast.error("Order not found", { description: "Returning to start." });
        navigate("/", { replace: true });
        return;
      }

      setPageState({
        coin: data.coin as Coin,
        network: data.network as Network,
        depositAddress: data.deposit_address,
        expiresAt: data.expires_at,
        order: {
          id: data.id,
          paymentContractId: data.payment_contract_id ?? undefined,
          orderNumber: data.order_number,
          merchant: data.merchant,
          status: normalizeOrderStatus(data.status),
          subtotal: Number(data.subtotal),
          fee: Number(data.fee),
          amountDue: Number(data.amount_due),
        },
      });
      if (data.tx_hash) setTxHash(data.tx_hash);
      if (typeof data.confirmations === "number") setConfirmations(data.confirmations);
      setLoadingOrder(false);
    };

    void bootstrapOrder();

    return () => {
      cancelled = true;
    };
  }, [navigate, orderIdFromQuery, state]);

  const [ack1, setAck1] = useState(false);
  const [ack2, setAck2] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(DEADLINE_SECONDS);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<OrderStatus>(pageState?.order.status ?? "Pending");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [paymentContractId, setPaymentContractId] = useState<string | null>(
    pageState?.order.paymentContractId ?? null
  );
  const [confirmations, setConfirmations] = useState<number>(0);
  const lastNotifiedStatusRef = useRef<OrderStatus | null>(pageState?.order.status ?? null);
  const hasShownWatcherErrorRef = useRef(false);

  const acknowledged = ack1 && ack2;

  useEffect(() => {
    if (!pageState) return;
    setStatus(normalizeOrderStatus(pageState.order.status));
    if (pageState.order.paymentContractId) {
      setPaymentContractId(pageState.order.paymentContractId);
    }
  }, [pageState]);

  const notifyStatusChange = useCallback((nextStatus: OrderStatus) => {
    if (lastNotifiedStatusRef.current === nextStatus) return;
    lastNotifiedStatusRef.current = nextStatus;

    if (nextStatus === "Process") {
      toast.info("Payment detected", {
        description: "Waiting for network confirmations…",
      });
    } else if (nextStatus === "Paid") {
      toast.success("Funds received!", {
        description: "Your payment has been confirmed.",
      });
    } else if (nextStatus === "Expired") {
      toast.error("Order expired");
    }
  }, []);

  useEffect(() => {
    if (!pageState?.expiresAt) return;
    const expiresAtMs = new Date(pageState.expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs)) return;
    const left = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
    setSecondsLeft(left);
  }, [pageState?.expiresAt]);

  // Countdown timer (stops once Paid)
  useEffect(() => {
    if (!acknowledged || status === "Paid" || status === "Expired") return;
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
  }, [acknowledged, status, navigate]);

  // Realtime subscription on this order
  useEffect(() => {
    if (!pageState?.order.id) return;
    const orderId = pageState.order.id;

    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        (payload) => {
          const next = payload.new as {
            status: OrderStatus;
            tx_hash: string | null;
            payment_contract_id?: string | null;
            confirmations?: number | null;
          };
          setStatus(normalizeOrderStatus(next.status));
          if (next.tx_hash) setTxHash(next.tx_hash);
          if (next.payment_contract_id) setPaymentContractId(next.payment_contract_id);
          if (typeof next.confirmations === "number") setConfirmations(next.confirmations);
          notifyStatusChange(normalizeOrderStatus(next.status));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [notifyStatusChange, pageState?.order.id]);

  // Keep status in sync even if realtime events were missed or delayed.
  useEffect(() => {
    if (!pageState?.order.id) return;
    const orderId = pageState.order.id;

    const syncOrderStatus = async (triggerWatcher: boolean) => {
      if (triggerWatcher) {
        try {
          const { error: invokeError } = await supabase.functions.invoke("watch-payments");
          if (invokeError) {
            console.warn("watch-payments invoke failed:", invokeError.message);
            if (!hasShownWatcherErrorRef.current) {
              hasShownWatcherErrorRef.current = true;
              toast.error("Live monitoring unavailable", {
                description: "Could not reach watch-payments. Please check function deploy/secrets.",
              });
            }
          } else {
            hasShownWatcherErrorRef.current = false;
          }
        } catch (invokeErr) {
          console.warn("watch-payments invoke threw:", invokeErr);
          if (!hasShownWatcherErrorRef.current) {
            hasShownWatcherErrorRef.current = true;
            toast.error("Live monitoring unavailable", {
              description: "Could not reach watch-payments. Please check function deploy/secrets.",
            });
          }
        }
      }

      try {
        const primaryQuery = await supabase
          .from("orders")
          .select("status, tx_hash, payment_contract_id, confirmations")
          .eq("id", orderId)
          .single();

        let data = primaryQuery.data as
          | {
              status: string;
              tx_hash: string | null;
              payment_contract_id?: string | null;
              confirmations?: number | null;
            }
          | null;
        let error = primaryQuery.error;

        if (error?.message?.includes("payment_contract_id")) {
          const fallbackQuery = await supabase
            .from("orders")
            .select("status, tx_hash, confirmations")
            .eq("id", orderId)
            .single();
          data = fallbackQuery.data as
            | {
                status: string;
                tx_hash: string | null;
                confirmations?: number | null;
              }
            | null;
          error = fallbackQuery.error;
        }

        if (error || !data) return;

        const nextStatus = normalizeOrderStatus(data.status);
        setStatus(nextStatus);
        if (data.tx_hash) setTxHash(data.tx_hash);
        if (data.payment_contract_id) setPaymentContractId(data.payment_contract_id);
        if (typeof data.confirmations === "number") setConfirmations(data.confirmations);
        notifyStatusChange(nextStatus);
      } catch (queryErr) {
        console.warn("Order status sync failed:", queryErr);
      }
    };

    void syncOrderStatus(true);
    if (status === "Paid" || status === "Expired") return;

    const intervalId = setInterval(() => {
      void syncOrderStatus(true);
    }, 5000);

    return () => clearInterval(intervalId);
  }, [notifyStatusChange, pageState?.order.id, status]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  const coinName = useMemo(() => {
    if (!pageState) return "";
    return COINS.find((c) => c.id === pageState.coin)?.name ?? pageState.coin;
  }, [pageState]);

  const handleCopy = async () => {
    if (!pageState) return;
    await navigator.clipboard.writeText(pageState.depositAddress);
    setCopied(true);
    toast.success("Address copied");
    setTimeout(() => setCopied(false), 1800);
  };

  if (loadingOrder) return null;
  if (!pageState) return null;
  const { coin, network, order, depositAddress } = pageState;
  const isPaid = status === "Paid";

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
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CoinNetworkIcon coin={coin} network={network} />
            <div>
              <p className="font-semibold">{coin} · {network}</p>
              <p className="text-xs text-muted-foreground">{coinName}</p>
            </div>
          </div>
          <StatusBadge status={status} />
        </div>
      </section>

      {isPaid && (
        <section className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 mb-5 animate-fade-in">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-emerald-400">Payment received</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your order has been fully confirmed on-chain.
              </p>
              {txHash && (
                <a
                  href={`https://bscscan.com/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary hover:underline break-all mt-2 inline-block"
                >
                  View transaction →
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {!acknowledged && !isPaid && (
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

      {acknowledged && !isPaid && (
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
                <QRCodeImage value={depositAddress} size={180} />
              </div>
            </div>

            <div className="rounded-xl bg-secondary/60 border border-border p-3 flex items-center gap-2">
              <p className="font-mono text-xs break-all flex-1 text-foreground/90">{depositAddress}</p>
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
                This deposit address can only receive{" "}
                <span className="text-foreground font-semibold">{coinName} ({coin})</span> on the{" "}
                <span className="text-foreground font-semibold">{network}</span> network.
              </p>
            </div>
            <p className="pl-6">Funds sent to an incorrect address or network are not recoverable.</p>
            <p className="pl-6">
              The deposit amount needs to be exactly{" "}
              <span className="text-primary font-bold">${order.amountDue.toFixed(6)}</span> so we can
              attribute the payment to your order.
            </p>
          </section>
        </>
      )}

      <section className="bg-gradient-card border border-border rounded-2xl p-5 shadow-card">
        <h2 className="font-semibold mb-2">Order Details</h2>
        <div className="divide-y divide-border">
          <Row label="Order Number" value={order.orderNumber} />
          <Row label="Payment Contract" value={paymentContractId ?? "Creating..."} />
          <Row label="Merchant" value={order.merchant} />
          <Row label="Status" value={<StatusBadge status={status} />} />
          <Row label="Confirmations" value={String(confirmations)} />
          <Row label="Subtotal" value={`$${order.subtotal.toFixed(2)}`} />
          <Row label="Fee" value={`$${order.fee.toFixed(2)}`} />
          <Row label="Amount Due" value={`$${order.amountDue.toFixed(6)}`} accent />
        </div>
      </section>
    </main>
  );
};

export default Deposit;
