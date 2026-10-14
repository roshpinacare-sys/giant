"use client";

// giant · מציג-מרקדאון מעוצב (בלי-typography-plugin — מיפוי-יסודות-מדויק)
// בטיחות: react-markdown לא מריץ HTML גולמי כברירת-מחדל.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";

function el(classes: string): (props: { children?: ReactNode }) => React.ReactElement {
  return function El({ children }) {
    return <div className={classes}>{children}</div>;
  };
}

const components = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="mt-2 mb-4 border-b pb-2 text-2xl font-bold tracking-tight">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="mt-6 mb-3 text-xl font-bold">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="mt-5 mb-2 text-lg font-semibold">{children}</h3>
  ),
  h4: ({ children }: { children?: ReactNode }) => (
    <h4 className="mt-4 mb-2 font-semibold">{children}</h4>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="my-3 leading-relaxed">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="my-3 list-disc space-y-1.5 ps-6">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="my-3 list-decimal space-y-1.5 ps-6">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="my-4 border-s-4 border-emerald-600/60 bg-emerald-600/5 px-4 py-2 text-sm italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-6 border-dashed" />,
  a: ({ children, href }: { children?: ReactNode; href?: string }) => (
    <a href={href} className="text-emerald-600 underline underline-offset-4 dark:text-emerald-400">
      {children}
    </a>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-bold text-foreground">{children}</strong>
  ),
  code: ({ children, className }: { children?: ReactNode; className?: string }) =>
    className ? (
      <code className={`${className} block overflow-x-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed`} dir="ltr">
        {children}
      </code>
    ) : (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]" dir="ltr">
        {children}
      </code>
    ),
  pre: ({ children }: { children?: ReactNode }) => <pre className="my-4">{children}</pre>,
  table: ({ children }: { children?: ReactNode }) => (
    <div className="my-4 overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="border-b bg-muted/50 px-3 py-2 text-start font-semibold">{children}</th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="border-b px-3 py-2 align-top">{children}</td>
  ),
};

export function MarkdownView({ content }: { content: string }) {
  return (
    <div className="text-sm text-foreground/90">
      {/* remark-gfm: טבלאות-וקווים-תוחמים — הסכם-המיזוג-ומסמכים-רשמיים כוללים-טבלאות */}
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{content}</ReactMarkdown>
    </div>
  );
}

// גורמי-רמה-משמשים-גם-מחוץ (רשימות-פשוטות)
export const MdList = el("my-3 space-y-2");
