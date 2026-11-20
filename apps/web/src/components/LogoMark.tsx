interface LogoMarkProps {
  size?: number;
  className?: string;
}

const STANDARD_LAYERS = [
  {
    d: 'M12.6 7.6A3.6 3.6 0 0 1 16.2 4h4a3.6 3.6 0 0 1 3.6 3.6v12.8l-5.6-3.2-5.6 3.2Z',
    opacity: 0.34,
  },
  {
    d: 'M10 11.2a3.6 3.6 0 0 1 3.6-3.6h4a3.6 3.6 0 0 1 3.6 3.6V24l-5.6-3.2L10 24Z',
    opacity: 0.6,
  },
  {
    d: 'M7.4 14.8a3.6 3.6 0 0 1 3.6-3.6h4a3.6 3.6 0 0 1 3.6 3.6v12.8L13 24.4l-5.6 3.2Z',
    opacity: 1,
  },
];

const MINI_LAYERS = [
  {
    d: 'M12.6 7.6A3.6 3.6 0 0 1 16.2 4h4a3.6 3.6 0 0 1 3.6 3.6v12.8l-5.6-3.2-5.6 3.2Z',
    opacity: 0.62,
  },
  {
    d: 'M7.4 14.8a3.6 3.6 0 0 1 3.6-3.6h4a3.6 3.6 0 0 1 3.6 3.6v12.8L13 24.4l-5.6 3.2Z',
    opacity: 1,
  },
];

export function LogoMark({ size = 32, className }: LogoMarkProps) {
  const layers = size < 24 ? MINI_LAYERS : STANDARD_LAYERS;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={className}
    >
      <rect width="32" height="32" rx="9" fill="#5b5fd6" />
      {layers.map((layer) => (
        <path key={layer.opacity} d={layer.d} fill="#ffffff" opacity={layer.opacity} />
      ))}
    </svg>
  );
}
