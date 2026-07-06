import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  // Title is owned by the client-side <TabTitle /> (lib/attention.ts store) so
  // it can reflect session name + agent running state. Declaring it here too
  // would make React's metadata hoisting overwrite every dynamic update.
  description: "Pi Coding Agent Web Interface",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("pi-theme");if(t==="dark"){document.documentElement.classList.add("dark")}else if(t===null&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches){document.documentElement.classList.add("dark")}var s=localStorage.getItem("pi-skin")||"editorial";if(s!=="terminal"&&["industrial","aurora","editorial","glass"].indexOf(s)>=0){document.documentElement.setAttribute("data-skin",s)}}catch(e){}})();`,
          }}
        />
      </head>
      <body style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
        {children}
      </body>
    </html>
  );
}
