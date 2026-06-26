import { useEffect, useMemo, useRef } from 'react';
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';

type MindNode = { label: string; children?: MindNode[] };

interface MarkmapMindMapProps {
  node: MindNode;
  height?: number;
}

const transformer = new Transformer();

function escapeMarkdown(text: string): string {
  return String(text || '')
    .replace(/\r?\n/g, ' ')
    .replace(/^#+\s*/g, '')
    .replace(/[\[\]]/g, '')
    .trim();
}

export function mindNodeToMarkdown(node: MindNode, depth = 1): string {
  const prefix = '#'.repeat(Math.min(depth, 6));
  const label = escapeMarkdown(node.label || '未命名节点');
  const children = (node.children || []).map((child) => mindNodeToMarkdown(child, depth + 1)).join('\n');
  return `${prefix} ${label}${children ? '\n' + children : ''}`;
}

export function MarkmapMindMap({ node, height = 560 }: MarkmapMindMapProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const markmapRef = useRef<Markmap | null>(null);
  const markdown = useMemo(() => mindNodeToMarkdown(node), [node]);

  useEffect(() => {
    if (!svgRef.current) return;
    if (!markmapRef.current) {
      markmapRef.current = Markmap.create(svgRef.current, {
        autoFit: true,
        duration: 260,
        maxWidth: 280,
        color: () => '#0a0a0a',
        paddingX: 16,
      });
    }
    const { root } = transformer.transform(markdown);
    markmapRef.current.setData(root);
    setTimeout(() => markmapRef.current?.fit(), 60);
  }, [markdown]);

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        height,
        background: 'var(--canvas)',
        border: '1px solid var(--hairline)',
      }}
    >
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
}
