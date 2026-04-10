import NextLink from "next/link";
import type { ComponentProps } from "react";

type LinkProps = ComponentProps<typeof NextLink>;

export default function Link(props: LinkProps) {
  return <NextLink prefetch={false} {...props} />;
}
