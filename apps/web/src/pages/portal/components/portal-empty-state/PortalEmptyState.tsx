import "./PortalEmptyState.css";

type PortalEmptyStateProps = {
  symbol: string;
  title: string;
  description: string;
};
export function PortalEmptyState({
  symbol,
  title,
  description,
}: PortalEmptyStateProps) {
  return (
    <div className="portal-empty-panel">
      <span className="portal-empty-symbol" aria-hidden="true">
        {symbol}
      </span>
      <p>{title}</p>
      <span>{description}</span>
    </div>
  );
}
