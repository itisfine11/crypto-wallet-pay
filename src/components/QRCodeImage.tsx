import { useEffect, useState } from "react";
import QRCode from "qrcode";

export const QRCodeImage = ({ value, size = 180 }: { value: string; size?: number }) => {
  const [src, setSrc] = useState<string>("");

  useEffect(() => {
    QRCode.toDataURL(value, { width: size, margin: 1 }).then(setSrc).catch(() => setSrc(""));
  }, [value, size]);

  if (!src) return <div style={{ width: size, height: size }} className="bg-muted animate-pulse rounded" />;
  return <img src={src} alt="Deposit address QR code" width={size} height={size} />;
};
