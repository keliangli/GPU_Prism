import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GPU Prism · 访问统计",
  description: "GPU Prism 架构可视化网站的真实访问人数、浏览量与热门探索模块。",
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
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
