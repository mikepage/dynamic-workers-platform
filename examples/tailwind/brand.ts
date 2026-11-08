import plugin from "tailwindcss/plugin";

// A Tailwind plugin, loaded with @plugin "./brand.ts" in styles.css.
export default plugin(({ addComponents, matchUtilities, theme }) => {
  addComponents({
    ".callout": {
      borderLeftWidth: "4px",
      borderColor: "var(--color-brand)",
      paddingLeft: theme("spacing.4"),
      fontStyle: "italic",
    },
  });
  matchUtilities(
    { "text-shadow": (value: string) => ({ textShadow: value }) },
    { values: { sm: "0 1px 2px rgb(0 0 0 / 0.2)", lg: "0 2px 8px rgb(0 0 0 / 0.3)" } },
  );
});
