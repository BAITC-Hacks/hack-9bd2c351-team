import type { CSSProperties } from "react";
type Name = "bolt" | "chat" | "cart" | "arrow" | "paperclip" | "check" | "file" | "close" | "box" | "shield" | "chevron";
const paths: Record<Name, React.ReactNode> = {
  bolt: <path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z" />,
  chat: <path d="M21 11a9 9 0 0 1-9 9H4l-3 2 2-6a9 9 0 1 1 18-5Z" />,
  cart: <><path d="M2 3h3l3 12h11l3-9H6" /><circle cx="9" cy="20" r="1" /><circle cx="19" cy="20" r="1" /></>,
  arrow: <><path d="M12 20V4m-6 6 6-6 6 6" /></>,
  paperclip: <path d="m8 12 7-7a4 4 0 0 1 6 6l-10 10a6 6 0 0 1-8-8L13 3m-6 12 8-8a1.5 1.5 0 0 1 2 2l-8 8" />,
  check: <path d="m5 12 4 4L20 5" />,
  file: <><path d="M14 2H4v20h16V8l-6-6Zm0 0v6h6M8 13h8m-8 4h5" /></>,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  box: <><path d="m3 7 9-5 9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5M12 12v10M7 4l10 6" /></>,
  shield: <><path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z" /><path d="m8 12 3 3 5-5" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
};
export function Icon({ name, size = 20, style }: { name: Name; size?: number; style?: CSSProperties }) {
  return <svg aria-hidden="true" width={size} height={size} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
