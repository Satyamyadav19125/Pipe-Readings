/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Sky / water - lighter & friendlier
        brand: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          900: '#0c4a6e',
        },
        // Field / agriculture greens
        field: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          900: '#14532d',
        },
        // Earth / soil tones
        earth: {
          50: '#fefce8',
          100: '#fef9c3',
          400: '#facc15',
          600: '#ca8a04',
          800: '#854d0e',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'sans-serif'],
      },
      backgroundImage: {
        'water-gradient': 'linear-gradient(135deg, #f0f9ff 0%, #f0fdf4 100%)',
        'hero-gradient': 'linear-gradient(135deg, #0c4a6e 0%, #0369a1 50%, #15803d 100%)',
      },
    },
  },
  plugins: [],
};
