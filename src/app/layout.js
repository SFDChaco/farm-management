import './globals.css';

export const metadata = {
  title: 'FarmOS — Weidewirtschaft Paraguay',
  description: 'Professionelles Farm-Management für 3 Betriebe',
};

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
