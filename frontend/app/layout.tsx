import type { Metadata } from "next";
import "./globals.css";
import QueryProvider from "@/components/QueryProvider";

export const metadata: Metadata = {
  title: "BTC/USDT $65,420.00 | Algorithmic Trading Bot Terminal",
  description: "Production-grade algorithmic trading dashboard and bot control terminal",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full bg-[#0B0F17] text-slate-100 antialiased selection:bg-cyan-500 selection:text-black">
      <body className="min-h-full flex flex-col font-sans bg-[#0B0F17]">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
