import { COINS, NETWORKS, type Coin, type Network } from "@/lib/payment-data";

export const CoinIcon = ({ coin, size = 32 }: { coin: Coin; size?: number }) => {
  const c = COINS.find((x) => x.id === coin)!;
  return (
    <div
      className="flex items-center justify-center rounded-full font-bold text-white shrink-0"
      style={{ background: c.color, width: size, height: size, fontSize: size * 0.36 }}
    >
      {c.id === "USDT" ? "₮" : "$"}
    </div>
  );
};

export const NetworkBadge = ({ network, size = 22 }: { network: Network; size?: number }) => {
  const n = NETWORKS.find((x) => x.id === network)!;
  return (
    <div
      className="flex items-center justify-center rounded-full font-bold text-white shrink-0 ring-2 ring-card"
      style={{ background: n.color, width: size, height: size, fontSize: size * 0.42 }}
    >
      {n.short.charAt(0)}
    </div>
  );
};

export const CoinNetworkIcon = ({ coin, network }: { coin: Coin; network: Network }) => (
  <div className="relative">
    <CoinIcon coin={coin} size={40} />
    <div className="absolute -bottom-1 -right-1">
      <NetworkBadge network={network} size={20} />
    </div>
  </div>
);
