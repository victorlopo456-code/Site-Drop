import type { SVGProps } from "react";

export function WhatsAppIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.5L3.5 20.5l1.4-4.3a8.5 8.5 0 1 1 15.6-4.6Z" />
      <path d="M8.2 7.7c.3-.3.7-.3 1-.1l1.1 1.7c.2.3.1.7-.1 1l-.6.6c.8 1.5 2 2.7 3.5 3.5l.6-.7c.3-.3.7-.3 1-.1l1.7 1.1c.3.2.4.7.1 1-1 1.2-2.2 1.4-3.8.8a9.8 9.8 0 0 1-5.2-5.2c-.6-1.5-.4-2.7.7-3.6Z" />
    </svg>
  );
}
