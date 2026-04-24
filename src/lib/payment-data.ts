export type Coin = "USDT" | "USDC";
export type Network = "TRON" | "POLYGON" | "BSC (BEP20)" | "Ethereum";

export const COINS: { id: Coin; name: string; symbol: string; color: string }[] = [
  { id: "USDT", name: "Tether USD", symbol: "USDT", color: "#26A17B" },
  { id: "USDC", name: "USD Coin", symbol: "USDC", color: "#2775CA" },
];

export const NETWORKS: { id: Network; name: string; short: string; color: string }[] = [
  { id: "TRON", name: "Tron", short: "TRC20", color: "#EF0027" },
  { id: "POLYGON", name: "Polygon", short: "MATIC", color: "#8247E5" },
  { id: "BSC (BEP20)", name: "BNB Smart Chain", short: "BEP20", color: "#F0B90B" },
  { id: "Ethereum", name: "Ethereum", short: "ERC20", color: "#627EEA" },
];

// Keep frontend choices aligned with networks monitored by watch-payments.
export const TRACKED_NETWORKS: Network[] = ["BSC (BEP20)"];

// Real merchant wallet (BSC). Other networks fall back to demo for now.
export const WALLETS: Partial<Record<Network, string>> = {
  "BSC (BEP20)": "0x1Cc448AF59bfdB32aC79E6E40a4CEdC59D29a01D",
};
export const DEMO_ADDRESS = "0x1Cc448AF59bfdB32aC79E6E40a4CEdC59D29a01D";

export type OrderStatus = "Pending" | "Process" | "Paid" | "Expired";

export type OrderInfo = {
  id?: string;
  paymentContractId?: string;
  orderNumber: string;
  merchant: string;
  status: OrderStatus;
  subtotal: number;
  fee: number;
  amountDue: number;
};

export function generateOrder(): OrderInfo {
  const orderNumber =
    "ORD-" +
    Math.random().toString(36).slice(2, 6).toUpperCase() +
    "-" +
    Math.floor(1000 + Math.random() * 9000);
  const subtotal = 1;
  const fee = 0;
  const amountDue = 1;
  return {
    orderNumber,
    merchant: "Lovable Crypto Store",
    status: "Pending",
    subtotal,
    fee,
    amountDue,
  };
}
