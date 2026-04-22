import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { type Coin, type Network, type OrderInfo } from "@/lib/payment-data";
import { CoinNetworkIcon } from "./CoinIcon";
import { CoinNetworkModal } from "./CoinNetworkModal";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: OrderInfo;
  onProceed: (coin: Coin, network: Network) => void;
};

const Row = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
const Row = ({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) => (
  <div className="flex justify-between items-center py-2 text-sm gap-3">
    <span className="text-muted-foreground">{label}</span>
    <span className={accent ? "font-bold text-primary text-base" : "font-medium text-foreground"}>{value}</span>
  </div>
);

export const PaymentModal = ({ open, onOpenChange, order, onProceed }: Props) => {
  const [coin, setCoin] = useState<Coin | undefined>();
  const [network, setNetwork] = useState<Network | undefined>();
  const [selectorOpen, setSelectorOpen] = useState(false);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-gradient-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Complete Payment</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <button
              onClick={() => setSelectorOpen(true)}
              className="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-secondary/40 hover:border-primary/50 transition-all"
            >
              {coin && network ? (
                <>
                  <CoinNetworkIcon coin={coin} network={network} />
                  <div className="text-left flex-1">
                    <p className="font-semibold text-sm">{coin}</p>
                    <p className="text-xs text-muted-foreground">{network}</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="h-10 w-10 rounded-full bg-secondary border border-dashed border-muted-foreground/40" />
                  <div className="text-left flex-1">
                    <p className="font-semibold text-sm">Select Coin & Network</p>
                    <p className="text-xs text-muted-foreground">Choose how to pay</p>
                  </div>
                </>
              )}
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>

            <div className="rounded-xl bg-secondary/40 border border-border p-4 divide-y divide-border">
              <Row label="Order Number" value={order.orderNumber} />
              <Row label="Merchant" value={order.merchant} />
              <Row label="Status" value={order.status} />
              <Row label="Subtotal" value={`$${order.subtotal.toFixed(2)}`} />
              <Row label="Fee" value={`$${order.fee.toFixed(2)}`} />
              <Row label="Amount Due" value={`$${order.amountDue.toFixed(2)}`} accent />
            </div>

            <Button
              disabled={!coin || !network}
              onClick={() => coin && network && onProceed(coin, network)}
              className="w-full bg-gradient-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-40"
              size="lg"
            >
              Continue to Payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CoinNetworkModal
        open={selectorOpen}
        onOpenChange={setSelectorOpen}
        initialCoin={coin}
        initialNetwork={network}
        onConfirm={(c, n) => {
          setCoin(c);
          setNetwork(n);
          setSelectorOpen(false);
        }}
      />
    </>
  );
};
