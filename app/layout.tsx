import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hobruk Paint Studio",
  description:
    "Рабочее пространство для создания картин по номерам: палитры, правки, лимиты и производственные файлы.",
  openGraph: {
    title: "Hobruk Paint Studio",
    description: "Создание картин по номерам",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hobruk Paint Studio",
    description: "Создание картин по номерам",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru"><body>{children}</body></html>
  );
}
