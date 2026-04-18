import { publisherLabel } from '../../lib/utils';
import type { PublisherPlugin } from '../../lib/types';
export function PluginTypeBadge({ plugin }: { plugin: PublisherPlugin }) { const label = publisherLabel(plugin.plugin_type || plugin.trust_level, plugin.publisher_slug); return <span className={`lbl ${label.cls}`}>{label.text}</span>; }
