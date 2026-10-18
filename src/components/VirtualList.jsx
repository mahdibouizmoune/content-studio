import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export default function VirtualList({ items, children, estimateSize = 160, label = 'Results', getKey = item => item.id }) {
  const parent = useRef(null);
  const virtual = useVirtualizer({ count: items.length, getScrollElement: () => parent.current, estimateSize: () => estimateSize, overscan: 5, getItemKey: index => getKey(items[index]), enabled: items.length > 50 });
  if (items.length <= 50) return <div className="space-y-3">{items.map((item, index) => <div key={getKey(item)}>{children(item, index)}</div>)}</div>;
  return <div ref={parent} role="region" aria-label={label} tabIndex={0} className="max-h-[70vh] overflow-auto" style={{ contain: 'strict', height: '70vh' }}>
    <div style={{ height: virtual.getTotalSize(), position: 'relative', width: '100%' }}>
      {virtual.getVirtualItems().map(row => <div key={row.key} data-index={row.index} ref={virtual.measureElement} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${row.start}px)`, paddingBottom: 12 }}>{children(items[row.index], row.index)}</div>)}
    </div>
  </div>;
}
