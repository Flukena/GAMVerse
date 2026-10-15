export function SocialControls({
  nearestTitle,
}: {
  nearestTitle: string | null;
}) {
  return (
    nearestTitle ? <div className="gather-social-controls" aria-label="Interaction hint"><span role="status">X to open: {nearestTitle}</span></div> : null
  );
}
