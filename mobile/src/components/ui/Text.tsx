import { Text as RNText, type TextProps } from "react-native";
import { cn } from "@/lib/cn";

type Variant = "display" | "title" | "heading" | "body" | "label" | "caption" | "overline";
export type Tone = "text" | "muted" | "subtle" | "accent" | "danger" | "warn" | "ok" | "ink" | "white";
type Weight = "regular" | "medium" | "semibold" | "bold";

const size: Record<Variant, string> = {
  display: "text-[28px] leading-9",
  title: "text-[22px] leading-7",
  heading: "text-[17px] leading-6",
  body: "text-[15px] leading-[22px]",
  label: "text-[14px] leading-5",
  caption: "text-[13px] leading-[18px]",
  overline: "text-[11px] uppercase tracking-[1.2px]",
};

const defaultWeight: Record<Variant, Weight> = {
  display: "bold",
  title: "bold",
  heading: "semibold",
  body: "regular",
  label: "medium",
  caption: "regular",
  overline: "semibold",
};

const defaultTone: Record<Variant, Tone> = {
  display: "text",
  title: "text",
  heading: "text",
  body: "text",
  label: "text",
  caption: "muted",
  overline: "subtle",
};

const weights: Record<Weight, string> = {
  regular: "font-sans",
  medium: "font-sans-medium",
  semibold: "font-sans-semibold",
  bold: "font-sans-bold",
};

const tones: Record<Tone, string> = {
  text: "text-text",
  muted: "text-muted",
  subtle: "text-subtle",
  accent: "text-accent",
  danger: "text-danger",
  warn: "text-warn",
  ok: "text-ok",
  ink: "text-accent-ink",
  white: "text-white",
};

export function Text({
  variant = "body",
  tone,
  weight,
  className,
  ...props
}: TextProps & { variant?: Variant; tone?: Tone; weight?: Weight; className?: string }) {
  return (
    <RNText
      className={cn(size[variant], weights[weight ?? defaultWeight[variant]], tones[tone ?? defaultTone[variant]], className)}
      {...props}
    />
  );
}
