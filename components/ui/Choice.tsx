import type { InputHTMLAttributes } from "react";

// Cases, boutons radio et interrupteurs dessinés en CSS (.choice / .switch dans globals.css), sans JS.

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const checkboxClass = "choice";
export const switchClass = "switch";

export function Checkbox({ className = "", ...props }: Props) {
  return <input type="checkbox" className={`choice ${className}`} {...props} />;
}

export function Radio({ className = "", ...props }: Props) {
  return <input type="radio" className={`choice ${className}`} {...props} />;
}

/** Interrupteur : une case à cocher avec role="switch". */
export function Switch({ className = "", ...props }: Props) {
  return <input type="checkbox" role="switch" className={`switch ${className}`} {...props} />;
}
