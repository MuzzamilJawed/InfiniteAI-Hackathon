import Image from "next/image";

interface Props {
  size?: number;
  className?: string;
}

export function Logo({ size = 36, className = "" }: Props) {
  return (
    <Image
      src="/logo.svg"
      alt="fraudentify"
      width={size}
      height={size}
      className={`rounded-xl shrink-0 ${className}`}
      priority
    />
  );
}
