export const metadata = { title: "圆桌讨论", description: "AI 多角色独立辩论" };

export default function RootLayout({ children }) {
  return (
    <html lang="zh">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fff" }}>
        {children}
      </body>
    </html>
  );
}
