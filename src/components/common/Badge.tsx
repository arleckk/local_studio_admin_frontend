import { statusLbl } from '../../lib/utils';
export function Badge({ value }: { value?: string | null }) { const { cls, text } = statusLbl(value); return <span className={`lbl ${cls}`}>{text}</span>; }
