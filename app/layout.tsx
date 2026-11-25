import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "小芽英语 · 每一步，看得见的成长",
  description: "新版人教 PEP 四、五年级上册英语学习辅导助手",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
