
module.exports = {
  content: ['./app/**/*.{js,ts,tsx}', './component/**/*.{js,ts,tsx}', './components/**/*.{js,ts,tsx}'],

  darkMode: 'class',

  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background) / <alpha-value>)',
        'background-deep': 'hsl(var(--background-deep) / <alpha-value>)',
        onyx: 'hsl(var(--onyx) / <alpha-value>)',
        card: 'hsl(var(--card) / <alpha-value>)',
        elevated: 'hsl(var(--elevated) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        chip: 'hsl(var(--chip) / <alpha-value>)',
        'chip-icon': 'hsl(var(--chip-icon) / <alpha-value>)',
        border: 'hsl(var(--border) / <alpha-value>)',
        'border-soft': 'hsl(var(--border-soft) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        muted: 'hsl(var(--muted) / <alpha-value>)',
        'muted-soft': 'hsl(var(--muted-soft) / <alpha-value>)',
        disabled: 'hsl(var(--disabled) / <alpha-value>)',
        dot: 'hsl(var(--dot) / <alpha-value>)',
        accent: 'hsl(var(--accent) / <alpha-value>)',
        'accent-strong': 'hsl(var(--accent-strong) / <alpha-value>)',
        'accent-soft': 'hsl(var(--accent-soft) / <alpha-value>)',
        success: 'hsl(var(--success) / <alpha-value>)',
        danger: 'hsl(var(--danger) / <alpha-value>)',
        warning: 'hsl(var(--warning) / <alpha-value>)',
        chart: 'hsl(var(--chart) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
