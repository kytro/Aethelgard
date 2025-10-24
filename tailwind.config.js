/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}", // This line is the crucial fix
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};