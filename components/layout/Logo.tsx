/*
  Brand logo: /brand/logo-full.webp (256 x 75, the round "EM" mark on the left).
  LogoIcon shows only the mark by cropping the left of the same image.
*/
const SRC = '/brand/logo-full.webp';

export function LogoIcon({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Estimate Master"
      className={`inline-block shrink-0 bg-no-repeat ${className}`}
      style={{ backgroundImage: `url(${SRC})`, backgroundSize: 'auto 100%', backgroundPosition: 'left center' }}
    />
  );
}

export function LogoFull({ className = 'h-12 w-auto' }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={SRC} alt="Estimate Master" className={`block shrink-0 ${className}`} />;
}
