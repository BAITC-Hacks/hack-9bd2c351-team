import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "EKT Assistant",
  description: "Консультант по электротехнической продукции: подбор, наличие, аналоги и корзина",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}

