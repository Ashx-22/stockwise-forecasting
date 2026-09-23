import './globals.css';

export const metadata = {
  title: 'Stockwise: demand forecasting you can defend',
  description: 'Daily demand forecasts for every store and item, with honest error ranges, rolling backtests, cost impact and drift monitoring.',
};

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#f8f4e8' };

const FONTS = 'https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Outfit:wght@500;600;700;800&display=swap';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>{children}</body>
    </html>
  );
}
