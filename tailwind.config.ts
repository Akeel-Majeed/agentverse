import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./components/**/*.{js,ts,jsx,tsx,mdx}", "./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        label: ["12.5px", { lineHeight: "16px", letterSpacing: "0" }],
      },
      colors: {
        // Hedged design system (docs/design-system.md)
        ink: "#121611",
        sub: "#565C50",
        line: "#DFDFD6",
        "line-strong": "#D2D1C9",
        panel: "#EFEEE2",
        hover: "#E9E8DC",
        paper: "#F6F5EC",
        lime: { DEFAULT: "#C9DB6A", surface: "#EEF2CF", border: "#D3DF94" },
        farmers: "#6E8F0A",
        banks: "#2B4BC8",
        brand: {
          DEFAULT: "#121611",
          surface: "#EEF2CF",
          border: "#D3DF94",
          label: "#4A5E05",
        },
        good: { DEFAULT: "#556F06", surface: "#EEF2D6", border: "#CBD99A" },
        bad: { DEFAULT: "#C8361C", surface: "#F8E3DD", border: "#E9B3A6" },
        warn: { DEFAULT: "#8A6A00", surface: "#FAF3D6", border: "#E8D58A", dot: "#D9A800" },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },
      borderRadius: {
        card: "20px",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        card: "0 16px 48px rgba(18, 22, 17, 0.07)",
        btn: "0 1px 2px rgba(18, 22, 17, 0.06)",
        sheet: "-16px 0 48px rgba(18, 22, 17, 0.08)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
