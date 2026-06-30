import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Compact markdown renderer for chat bubbles. Supports GFM tables, lists, bold, links.
export default function ChatMarkdown({ children }) {
  return (
    <div className="space-y-1.5 leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
          ul: ({ children }) => <ul className="list-disc space-y-0.5 pl-4">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-0.5 pl-4">{children}</ol>,
          li: ({ children }) => <li className="marker:text-muted-foreground">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="text-primary underline">{children}</a>,
          code: ({ children }) => <code className="rounded bg-black/5 px-1 py-px font-mono text-[11px]">{children}</code>,
          table: ({ children }) => (
            <div className="my-1 overflow-x-auto">
              <table className="w-full border-collapse text-[11px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-orange-50 text-orange-700">{children}</thead>,
          th: ({ children }) => <th className="border border-orange-100 px-2 py-1 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="border border-orange-100 px-2 py-1 align-top">{children}</td>,
        }}
      >
        {children || ''}
      </ReactMarkdown>
    </div>
  );
}
