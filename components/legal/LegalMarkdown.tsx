import Markdown, { type Components } from "react-markdown";
import { safeLegalUrl } from "@/lib/legal/legal";

// Texte légal en markdown, seule exception permise au rendu de contenu riche (CLAUDE.md) :
// aucun HTML brut (skipHtml), liens limités à https, mailto et chemins internes.

const components: Components = {
  h1: ({ children }) => <h2 className="mt-6 font-title text-2xl font-extrabold">{children}</h2>,
  h2: ({ children }) => <h2 className="mt-6 font-title text-xl font-extrabold">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-4 text-lg font-bold">{children}</h3>,
  p: ({ children }) => <p className="leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="flex list-disc flex-col gap-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="flex list-decimal flex-col gap-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-bold text-text">{children}</strong>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-shu pl-3 text-text-muted">{children}</blockquote>,
  hr: () => <hr className="border-border" />,
  a: ({ href, children }) => {
    if (!href) return <span>{children}</span>;
    const external = href.startsWith("https:") || href.startsWith("mailto:");
    return (
      <a
        href={href}
        className="font-medium text-ai underline underline-offset-4"
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>
    );
  },
  // Pas d'images ni de code dans les textes légaux
  img: () => null,
  code: ({ children }) => <span>{children}</span>,
  pre: ({ children }) => <p>{children}</p>,
};

export function LegalMarkdown({ body }: { body: string }) {
  return (
    <div className="flex max-w-prose flex-col gap-3 text-sm text-text md:text-base">
      <Markdown skipHtml urlTransform={safeLegalUrl} components={components}>
        {body}
      </Markdown>
    </div>
  );
}
