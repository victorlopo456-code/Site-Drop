const carrierUrls: Array<{ pattern: RegExp; url: (code: string) => string }> = [
  {
    pattern: /correios|sedex|pac/i,
    url: (code) =>
      `https://rastreamento.correios.com.br/app/index.php?objetos=${encodeURIComponent(code)}`,
  },
  {
    pattern: /jadlog/i,
    url: (code) => `https://www.jadlog.com.br/tracking?cte=${encodeURIComponent(code)}`,
  },
  {
    pattern: /loggi/i,
    url: (code) => `https://www.loggi.com/rastreador/?codigo=${encodeURIComponent(code)}`,
  },
];

export function trackingUrl(carrier: string | null, code: string) {
  const matched = carrierUrls.find(({ pattern }) => pattern.test(carrier ?? ""));
  return (
    matched?.url(code) ??
    `https://www.google.com/search?q=${encodeURIComponent(`rastrear ${carrier ?? "pedido"} ${code}`)}`
  );
}
