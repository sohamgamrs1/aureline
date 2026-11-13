import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#07070B",
          900: "#0A0A0F",
          850: "#0E0E15",
          800: "#12121A",
          700: "#1A1A24",
          600: "#24242F",
        },
        gold: {
          50: "#FBF5E4",
          100: "#F4E6BF",
          200: "#EBD79A",
          300: "#E0C576",
          400: "#D4AF37",
          500: "#C29A2E",
          600: "#9E7B22",
        },
        muted: "#9CA3AF",
      },
      fontFamily: {
        display: ["var(--font-display)", "Playfair Display", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "20px",
      },
      boxShadow: {
        soft: "0 18px 50px -24px rgba(0,0,0,0.85)",
        gold: "0 0 0 1px rgba(212,175,55,0.16), 0 24px 60px -30px rgba(212,175,55,0.35)",
        lift: "0 30px 80px -40px rgba(0,0,0,0.9)",
      },
      backgroundImage: {
        "gold-sheen":
          "linear-gradient(135deg, #F4E6BF 0%, #D4AF37 42%, #9E7B22 100%)",
        "gold-line":
          "linear-gradient(90deg, rgba(212,175,55,0) 0%, rgba(212,175,55,0.55) 50%, rgba(212,175,55,0) 100%)",
        "card-sheen":
          "linear-gradient(160deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.012) 45%, rgba(255,255,255,0) 100%)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.97)", opacity: "0.55" },
          "70%": { transform: "scale(1.03)", opacity: "0" },
          "100%": { transform: "scale(1.03)", opacity: "0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.7s cubic-bezier(0.22,1,0.36,1) both",
        "fade-in": "fade-in 0.6s ease-out both",
        shimmer: "shimmer 2.6s linear infinite",
        "pulse-ring": "pulse-ring 2.8s cubic-bezier(0.22,1,0.36,1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
