import type { Metadata } from "next";
import { NOME_SISTEMA } from "@/lib/marca";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import DialogoHost from "@/components/comum/DialogoHost";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: NOME_SISTEMA,
  description: "Gestão de rede de fibra óptica",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className={`${inter.className} min-h-full bg-gray-50`}>
        <AuthProvider>{children}</AuthProvider>
        <DialogoHost />
      </body>
    </html>
  );
}
