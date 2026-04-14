/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "codenest-bg": "#070b0a",
        "codenest-green": "#5ed29c"
      },
      boxShadow: {
        "glass-inset": "inset 0 1px 1px rgba(255, 255, 255, 0.1)"
      },
      fontFamily: {
        inter: ["Inter", "sans-serif"],
        jakarta: ['"Plus Jakarta Sans"', "sans-serif"],
        instrument: ['"Instrument Serif"', "serif"]
      }
    }
  },
  plugins: []
};
