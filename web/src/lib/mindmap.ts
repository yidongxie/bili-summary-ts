// Lightweight mind-map utilities (no markmap/d3 dependency) so pages can
// import them without pulling in the heavy mind-map rendering bundle.

export type MindNode = { label: string; children?: MindNode[] };

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
