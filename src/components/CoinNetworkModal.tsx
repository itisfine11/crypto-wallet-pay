import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { COINS, NETWORKS, TRACKED_NETWORKS, type Coin, type Network } from "@/lib/payment-data";
import { CoinIcon, NetworkBadge } from "./CoinIcon";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (coin: Coin, network: Network) => void;
  initialCoin?: Coin;
  initialNetwork?: Network;
};

export const CoinNetworkModal = ({ open, onOpenChange, onConfirm, initialCoin, initialNetwork }: Props) => {
  const [coin, setCoin] = useState<Coin | undefined>(initialCoin);
  const [network, setNetwork] = useState<Network | undefined>(initialNetwork);
  const availableNetworks = NETWORKS.filter((n) => TRACKED_NETWORKS.includes(n.id));

  const canConfirm = coin && network;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gradient-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Select Coin & Network</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Coin</p>
            <div className="grid grid-cols-2 gap-2">
              {COINS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCoin(c.id)}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border transition-all",
                    coin === c.id
                      ? "border-primary bg-primary/10 shadow-glow"
                      : "border-border bg-secondary/40 hover:border-muted-foreground/40"
                  )}
                >
                  <CoinIcon coin={c.id} size={32} />
                  <div className="text-left">
                    <p className="font-semibold text-sm">{c.id}</p>
                    <p className="text-xs text-muted-foreground">{c.name}</p>
                  </div>
                  {coin === c.id && <Check className="ml-auto h-4 w-4 text-primary" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Network</p>
            <div className="space-y-2">
              {availableNetworks.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setNetwork(n.id)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl border transition-all",
                    network === n.id
                      ? "border-primary bg-primary/10 shadow-glow"
                      : "border-border bg-secondary/40 hover:border-muted-foreground/40"
                  )}
                >
                  <NetworkBadge network={n.id} size={28} />
                  <div className="text-left flex-1">
                    <p className="font-semibold text-sm">{n.id}</p>
                    <p className="text-xs text-muted-foreground">{n.name} · {n.short}</p>
                  </div>
                  {network === n.id && <Check className="h-4 w-4 text-primary" />}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Live payment tracking is currently available on BSC (BEP20).
            </p>
          </div>

          <Button
            disabled={!canConfirm}
            onClick={() => canConfirm && onConfirm(coin!, network!)}
            className="w-full bg-gradient-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-40"
            size="lg"
          >
            Confirm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
