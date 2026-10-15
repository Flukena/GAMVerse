export function SocialControls({
  nearestTitle,
}: {
  nearestTitle: string | null;
}) {
  if (!nearestTitle) return null;
  return (
    <div
      className="gather-social-controls"
      aria-label="Interaction"
    >
      <span role="status">X to open: {nearestTitle}</span>
    </div>
  );
}
