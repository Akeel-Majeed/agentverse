import animate from "tailwindcss-animate";
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
        ink: "#1C1C1A",
        sub: "#6F6E69",
        line: "#E9E8E4",
        "line-strong": "#D6D5CF",
        panel: "#F6F5F2",
        hover: "#EFEEE9",
        brand: {
          DEFAULT: "#2F5BEA",
          surface: "#EEF2FF",
          border: "#C7D2FE",
          label: "#3730A3",
        },
        good: "#15803D",
        bad: "#B91C1C",
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
        card: "12px",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        card: "0 1px 2px rgba(28, 28, 26, 0.04), 0 1px 1px rgba(28, 28, 26, 0.03)",
        btn: "0 1px 2px rgba(28, 28, 26, 0.06)",
        sheet: "-8px 0 24px rgba(28, 28, 26, 0.08)",
      },
    },
  },
  plugins: [animate],
};
export default config;
